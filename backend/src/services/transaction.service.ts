// ============================================================
// Borrow Transaction & Reservation Service
// Enhanced with:
// - Max 3 books for STUDENT, configured limit for FACULTY
// - Period selection (7/14/30 days) for FACULTY
// - QR code generation on approval
// - Return with QR verification
// - Reservation queue management
// - Overdue checks and fine calculations
// ============================================================

import { prisma } from '../config';
import { env } from '../config/env';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination';
import { generateQRCode, generateQRFromText } from '../utils/qrcode';
import { policyService } from './policy.service';
import { notificationService } from './notification.service';
import { Role } from '@prisma/client';
import crypto from 'crypto';
import jwt, { JwtPayload as JsonWebTokenPayload } from 'jsonwebtoken';

const QR_TOKEN_TTL_SECONDS = 10 * 60;

function generateApprovalCode(): string {
  const value = crypto.randomInt(0, 1_000_000_000).toString().padStart(9, '0');
  return `BRW-${value.slice(0, 4)}-${value.slice(4)}`;
}

function hashQrToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class TransactionService {
  // ============================================================
  // Borrow Requests
  // ============================================================

  /**
   * Maximum number of books allowed per transaction / request.
   */
  static readonly MAX_BOOKS_PER_TRANSACTION = 3;

  /**
   * Calculate the due date from the borrower's role and the actual borrow date.
   * Policy values are configurable by librarians; fallbacks keep existing
   * installations working until the new policy rows are seeded.
   */
  private async calculateBorrowDueDate(user: { role: Role; maxBorrowDays: number | null }, borrowDate: Date) {
    const policyKey = user.role === Role.FACULTY ? 'FACULTY_BORROW_DAYS' : 'STUDENT_BORROW_DAYS';
    const fallbackDays = user.role === Role.FACULTY ? 120 : 3;
    const borrowDays = user.maxBorrowDays ?? (await policyService.getNumber(policyKey, fallbackDays));
    const dueDate = new Date(borrowDate);
    dueDate.setDate(dueDate.getDate() + borrowDays);
    return dueDate;
  }

  /**
   * Create borrow request(s)
   * - Enforces a maximum of 3 books per transaction.
   * - STUDENT: max 3 active books
   * - FACULTY: uses FACULTY_MAX_BOOKS policy (default 10)
   * - LIBRARIAN: no limit
   *
   * Accepts either a single `bookId` (backward compatible) or an
   * array `bookIds` for multi-book transactions.
   */
  async createBorrowRequest(input: {
    userId: string;
    bookIds: string[];
    notes?: string;
  }) {
    const { userId, bookIds, notes } = input;
    const uniqueBookIds = Array.from(new Set(bookIds));

    // Enforce per-transaction limit of 3 books
    if (uniqueBookIds.length > TransactionService.MAX_BOOKS_PER_TRANSACTION) {
      throw new BadRequestError(
        'You can only borrow a maximum of 3 books per transaction.'
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    if (!user.isActive) {
      throw new BadRequestError('Your account is deactivated. Contact a librarian.');
    }

    // Validate each book and check availability
    const books = await prisma.book.findMany({
      where: { id: { in: uniqueBookIds } },
    });
    if (books.length !== uniqueBookIds.length) {
      throw new NotFoundError('One or more books');
    }

    for (const book of books) {
      if (book.status === 'LOST') {
        throw new BadRequestError(`"${book.title}" is marked as lost and cannot be borrowed`);
      }
      if (book.status === 'MAINTENANCE') {
        throw new BadRequestError(`"${book.title}" is under maintenance`);
      }
      if (book.availableCopies < 1) {
        throw new BadRequestError(
          `No copies of "${book.title}" are currently available. You can reserve it instead.`
        );
      }
    }

    // Check existing pending/approved requests for these books.
    // IMPORTANT: Only block on a request that is GENUINELY still outstanding.
    // - PENDING requests always block (not yet processed by a librarian).
    // - APPROVED requests only block if the user STILL has the book, i.e.,
    //   there is an ACTIVE or OVERDUE transaction for that book. Approving a
    //   request always creates a transaction, and when the book is returned
    //   the transaction becomes RETURNED — but the request row stays APPROVED
    //   forever. That stale APPROVED row must NOT block the user from
    //   requesting the same book again.
    const existingRequests = await prisma.borrowRequest.findMany({
      where: {
        userId,
        bookId: { in: uniqueBookIds },
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    const pendingRequests = existingRequests.filter((r) => r.status === 'PENDING');

    let approvedStillBlocking = false;
    const approvedRequests = existingRequests.filter((r) => r.status === 'APPROVED');
    if (approvedRequests.length > 0) {
      const approvedBookIds = approvedRequests.map((r) => r.bookId);
      const activeTxns = await prisma.borrowTransaction.count({
        where: {
          userId,
          bookId: { in: approvedBookIds },
          status: { in: ['ACTIVE', 'OVERDUE'] },
        },
      });
      approvedStillBlocking = activeTxns > 0;
    }

    if (pendingRequests.length > 0 || approvedStillBlocking) {
      const blocking = [
        ...pendingRequests,
        ...(approvedStillBlocking ? approvedRequests : []),
      ];
      const titles = blocking.map((r) => r.bookId).join(', ');
      throw new ConflictError(
        `You already have a pending or approved request for one of these books (${titles}).`
      );
    }

    // Check existing active transactions for these books
    const existingActive = await prisma.borrowTransaction.findFirst({
      where: { userId, bookId: { in: uniqueBookIds }, status: 'ACTIVE' },
    });
    if (existingActive) {
      throw new ConflictError('You already have one of these books borrowed');
    }

    // Enforce max books limit based on role
    const activeCount = await prisma.borrowTransaction.count({
      where: { userId, status: 'ACTIVE' },
    });

    let maxBooks: number;
    if (user.role === Role.STUDENT) {
      maxBooks = user.maxBooksAllowed ?? (await policyService.getNumber('MAX_BOOKS_PER_USER', 3));
    } else if (user.role === Role.FACULTY) {
      maxBooks = user.maxBooksAllowed ?? (await policyService.getNumber('FACULTY_MAX_BOOKS', 10));
    } else {
      maxBooks = 999; // Librarians have no practical limit
    }

    if (activeCount + uniqueBookIds.length > maxBooks) {
      throw new BadRequestError(
        `You have reached the maximum limit of ${maxBooks} active borrows. Return a book first.`
      );
    }

    // Create a request per book
    const created: any[] = [];
    for (const bookId of uniqueBookIds) {
      const book = books.find((b) => b.id === bookId)!;
      const request = await prisma.borrowRequest.create({
        data: { userId, bookId, notes },
        include: {
          book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true } },
          user: { select: { firstName: true, lastName: true, libraryId: true, role: true } },
        },
      });

      // Activity log
      await prisma.activityLog.create({
        data: {
          userId,
          action: 'BORROW_REQUEST',
          entity: 'BorrowRequest',
          entityId: request.id,
          details: { bookTitle: book.title, bookId },
        },
      });

      created.push(request);
    }

    // Notify all librarians about the new borrow request(s)
    const requesterName = `${user.firstName} ${user.lastName}`;
    const bookCount = uniqueBookIds.length;
    const bookTitles = books.map((b) => b.title).join(', ');
    await notificationService.notifyAllLibrarians(
      'BORROW_CONFIRMATION',
      'New Borrow Request',
      `${requesterName} requested to borrow ${bookCount} book${bookCount > 1 ? 's' : ''}${bookCount === 1 ? ` (${bookTitles})` : ''}`,
      '/requests'
    );

    return uniqueBookIds.length === 1 ? created[0] : created;
  }

  /**
   * Approve a borrow request (librarian only)
   * - Generates QR code for the transaction
  * - STUDENT due dates use STUDENT_BORROW_DAYS (default 3)
  * - FACULTY due dates use FACULTY_BORROW_DAYS (default 120)
   * - Handles reservation queue fulfillment
   */
  async approveRequest(requestId: string, librarianId: string) {
    const request = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      include: {
        book: true,
        user: true,
      },
    });
    if (!request) throw new NotFoundError('Borrow request');
    if (request.status !== 'PENDING') {
      throw new BadRequestError('Request has already been processed');
    }
    if (request.book.availableCopies < 1) {
      throw new BadRequestError('No copies available for this book');
    }

    // Calculate from the exact borrow date that will be stored.
    const borrowDate = new Date();
    const dueDate = await this.calculateBorrowDueDate(request.user, borrowDate);

    let approvalCode = generateApprovalCode();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.borrowRequest.findUnique({
        where: { approvalCode },
      });
      if (!existing) break;
      approvalCode = generateApprovalCode();
      attempts++;
    }

    // Generate QR code payload with transaction ID
    const qrPayload = {
      txnId: approvalCode,
      accessionNo: request.book.accessionNo,
      userId: request.userId,
      issuedAt: new Date().toISOString(),
    };
    const qrCodeDataUrl = await generateQRCode(qrPayload);

    // Execute transactional updates
    const [transaction] = await prisma.$transaction([
      prisma.borrowTransaction.create({
        data: {
          userId: request.userId,
          bookId: request.bookId,
          borrowDate,
          dueDate,
          status: 'ACTIVE',
          notes: request.notes || undefined,
          qrCode: qrCodeDataUrl,
        },
        include: {
          book: { select: { title: true, accessionNo: true, isbn: true, shelf: true, row: true } },
          user: { select: { id: true, firstName: true, lastName: true, libraryId: true, role: true } },
        },
      }),
      prisma.borrowRequest.update({
        where: { id: requestId },
          data: {
            status: 'APPROVED',
            approvalCode,
            approvalTokenUsedAt: new Date(),
            processedById: librarianId,
            processedAt: new Date(),
          },
      }),
      prisma.book.update({
        where: { id: request.bookId },
        data: {
          availableCopies: { decrement: 1 },
          status: request.book.availableCopies - 1 <= 0 ? 'BORROWED' : 'AVAILABLE',
        },
      }),
      prisma.notification.create({
        data: {
          userId: request.userId,
          type: 'REQUEST_APPROVED',
          title: 'Borrow Request Approved',
          message: `Your request to borrow "${request.book.title}" has been approved. Due date: ${dueDate.toLocaleDateString()}. Show the QR code when picking up.`,
          link: `/transactions`, // Will be replaced with actual ID after creation
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: librarianId,
          action: 'APPROVE_REQUEST',
          entity: 'BorrowRequest',
          entityId: requestId,
          details: { bookTitle: request.book.title, userId: request.userId, dueDate },
        },
      }),
    ]);

    // If this book was reserved, mark the first active reservation as fulfilled
    const activeReservation = await prisma.reservation.findFirst({
      where: { bookId: request.bookId, status: 'ACTIVE', userId: request.userId },
    });
    if (activeReservation) {
      await prisma.reservation.update({
        where: { id: activeReservation.id },
        data: { status: 'FULFILLED', notified: true },
      });
    }

    // Recalculate queue positions for remaining reservations
    const remainingReservations = await prisma.reservation.findMany({
      where: { bookId: request.bookId, status: 'ACTIVE' },
      orderBy: { queuePosition: 'asc' },
    });
    for (let i = 0; i < remainingReservations.length; i++) {
      await prisma.reservation.update({
        where: { id: remainingReservations[i].id },
        data: { queuePosition: i + 1 },
      });
    }

    return { ...transaction, qrCode: qrCodeDataUrl, approvalCode };
  }

  /**
   * Reject a borrow request (with reason)
   */
  async rejectRequest(requestId: string, librarianId: string, reason: string) {
    const request = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      include: { book: true },
    });
    if (!request) throw new NotFoundError('Borrow request');
    if (request.status !== 'PENDING') throw new BadRequestError('Request already processed');

    await prisma.$transaction([
      prisma.borrowRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', processedById: librarianId, processedAt: new Date(), notes: reason },
      }),
      prisma.notification.create({
        data: {
          userId: request.userId,
          type: 'REQUEST_REJECTED',
          title: 'Borrow Request Rejected',
          message: `Your request to borrow "${request.book.title}" was rejected. Reason: ${reason}`,
          link: '/requests',
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: librarianId,
          action: 'REJECT_REQUEST',
          entity: 'BorrowRequest',
          entityId: requestId,
          details: { bookTitle: request.book.title, reason },
        },
      }),
    ]);
  }

  /**
   * Get a single borrow request by ID (used by the QR approval poller).
   */
  async getBorrowRequest(requestId: string) {
    const request = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, libraryId: true, role: true } },
        book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true } },
        processedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!request) throw new NotFoundError('Borrow request');
    return request;
  }

  /**
   * List borrow requests (with filters)
   */
async listBorrowRequests(query: Record<string, unknown>, userId?: string) {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where: any = {};
    if (userId) where.userId = userId;
    if (query.status) where.status = query.status;

    // Search by book title/accession no OR member name/library id
    if (query.search) {
      const s = query.search as string;
      where.OR = [
        { book: { title: { contains: s, mode: 'insensitive' } } },
        { book: { accessionNo: { contains: s, mode: 'insensitive' } } },
        { book: { author: { contains: s, mode: 'insensitive' } } },
        { user: { firstName: { contains: s, mode: 'insensitive' } } },
        { user: { lastName: { contains: s, mode: 'insensitive' } } },
        { user: { libraryId: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [requests, total] = await Promise.all([
      prisma.borrowRequest.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, libraryId: true, role: true } },
          book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true } },
          processedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { requestDate: 'desc' },
        skip,
        take,
      }),
      prisma.borrowRequest.count({ where }),
    ]);

    return { requests, meta: buildPaginationMeta(total, { page, limit, skip, take }) };
  }

  // ============================================================
  // Borrow Transactions
  // ============================================================

  /**
   * Return a borrowed book
   * - Accepts transaction ID or QR code
   * - Calculates overdue fines
   * - Updates book availability
   * - Notifies next in reservation queue
   */
  async returnBook(transactionIdOrQr: string) {
    let transaction;

    // First, try to find by ID
    transaction = await prisma.borrowTransaction.findUnique({
      where: { id: transactionIdOrQr },
      include: { book: true, user: { select: { id: true, firstName: true, lastName: true } } },
    });

    // If not found by ID, try QR scan - decode and find by accessionNo
    if (!transaction) {
      try {
        const decoded = JSON.parse(transactionIdOrQr);
        if (decoded.accessionNo) {
          transaction = await prisma.borrowTransaction.findFirst({
            where: {
              book: { accessionNo: decoded.accessionNo },
              status: { in: ['ACTIVE', 'OVERDUE'] },
              returnDate: null,
            },
            include: { book: true, user: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { borrowDate: 'desc' },
          });
        }
      } catch {
        // Not a QR payload either — try to find by accessionNo directly
        transaction = await prisma.borrowTransaction.findFirst({
          where: {
            book: { accessionNo: transactionIdOrQr },
            status: 'ACTIVE',
          },
          include: { book: true, user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { borrowDate: 'desc' },
        });
      }
    }

    if (!transaction) throw new NotFoundError('Active transaction for this book');
    if (transaction.returnDate) throw new BadRequestError('Book already returned');

    const now = new Date();
    const isOverdue = now > transaction.dueDate;

    // Calculate fine
    let fineAmount = 0;
    if (isOverdue) {
      const finePerDay = await policyService.getFloat('FINE_PER_DAY', 10);
      const diffDays = Math.ceil((now.getTime() - transaction.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      fineAmount = diffDays * finePerDay;
    }

    const [updated] = await prisma.$transaction([
      prisma.borrowTransaction.update({
        where: { id: transaction.id },
        data: {
          returnDate: now,
          status: isOverdue ? 'OVERDUE' : 'RETURNED',
          fineAmount,
          qrScanned: true,
        },
        include: {
          book: { select: { title: true, accessionNo: true, isbn: true } },
          user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
        },
      }),
      prisma.book.update({
        where: { id: transaction.bookId },
        data: { availableCopies: { increment: 1 }, status: 'AVAILABLE' },
      }),
      prisma.activityLog.create({
        data: {
          userId: transaction.userId,
          action: 'RETURN_BOOK',
          entity: 'BorrowTransaction',
          entityId: transaction.id,
          details: {
            bookTitle: transaction.book.title,
            accessionNo: transaction.book.accessionNo,
            isOverdue,
            fineAmount,
          },
        },
      }),
    ]);

    // Notify all librarians about the returned book
    const borrowerName = `${transaction.user.firstName} ${transaction.user.lastName}`;
    await notificationService.notifyAllLibrarians(
      'BORROW_CONFIRMATION',
      'Book Returned',
      `${borrowerName} returned "${transaction.book.title}"${isOverdue ? ' (overdue)' : ''}`,
      '/requests'
    );

    // If there's a fine, notify the user
    if (fineAmount > 0) {
      await prisma.notification.create({
        data: {
          userId: transaction.userId,
          type: 'OVERDUE_FINE',
          title: 'Overdue Fine Incurred',
          message: `Your borrowed book "${transaction.book.title}" was returned ${Math.ceil((now.getTime() - transaction.dueDate.getTime()) / (1000 * 60 * 60 * 24))} days late. Fine: ₱${fineAmount.toFixed(2)}.`,
          link: `/transactions/${transaction.id}`,
        },
      });
    }

    // Check and notify next reservation in queue
    const nextReservation = await prisma.reservation.findFirst({
      where: { bookId: transaction.bookId, status: 'ACTIVE' },
      orderBy: { queuePosition: 'asc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (nextReservation) {
      await prisma.notification.create({
        data: {
          userId: nextReservation.userId,
          type: 'RESERVATION_AVAILABLE',
          title: 'Reserved Book Now Available',
          message: `"${updated.book.title}" you reserved is now available. Please pick it up within ${await policyService.getNumber('MAX_RESERVATION_DAYS', 3)} days.`,
          link: `/reservations/${nextReservation.id}`,
        },
      });
    }

    return updated;
  }

/**
   * Declare a book as missing (librarian only)
   * - Marks the book as LOST
   * - Closes the active transaction (no return)
   * - Records an activity log
   * - Notifies the borrower
   */
  async declareMissing(transactionId: string, librarianId: string, reason?: string) {
    const transaction = await prisma.borrowTransaction.findUnique({
      where: { id: transactionId },
      include: { book: true, user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!transaction) throw new NotFoundError('Transaction');
    if (transaction.returnDate) throw new BadRequestError('Book already returned');

    const now = new Date();
    const isOverdue = now > transaction.dueDate;
    const fineAmount =
      (isOverdue ? transaction.fineAmount ?? 0 : 0) || 0;

    const [updated] = await prisma.$transaction([
      prisma.borrowTransaction.update({
        where: { id: transaction.id },
        data: {
          returnDate: now,
          status: isOverdue ? 'OVERDUE' : 'RETURNED',
          fineAmount,
          qrScanned: true,
          notes: reason ? `${transaction.notes ? transaction.notes + ' ' : ''}Declared missing: ${reason}`.trim() : (transaction.notes || undefined),
        },
        include: {
          book: { select: { title: true, accessionNo: true, isbn: true } },
          user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
        },
      }),
      prisma.book.update({
        where: { id: transaction.bookId },
        data: { availableCopies: 0, status: 'LOST' },
      }),
      prisma.activityLog.create({
        data: {
          userId: librarianId,
          action: 'DECLARE_MISSING',
          entity: 'BorrowTransaction',
          entityId: transaction.id,
          details: {
            bookTitle: transaction.book.title,
            accessionNo: transaction.book.accessionNo,
            borrower: `${transaction.user.firstName} ${transaction.user.lastName}`,
            reason: reason || null,
          },
        },
      }),
      prisma.notification.create({
        data: {
          userId: transaction.userId,
          type: 'SYSTEM',
          title: 'Book Declared Missing',
          message: `The book "${transaction.book.title}" you borrowed has been declared missing. Please contact the library.`,
          link: `/transactions/${transaction.id}`,
        },
      }),
    ]);

    return updated;
  }

  /**
   * List transactions with filters
   */
async listTransactions(query: Record<string, unknown>, userId?: string) {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where: any = {};
    if (userId) where.userId = userId;
    if (query.status) where.status = query.status;

    // Search by book title/accession no OR member name/library id
    if (query.search) {
      const s = query.search as string;
      where.OR = [
        { book: { title: { contains: s, mode: 'insensitive' } } },
        { book: { accessionNo: { contains: s, mode: 'insensitive' } } },
        { book: { author: { contains: s, mode: 'insensitive' } } },
        { user: { firstName: { contains: s, mode: 'insensitive' } } },
        { user: { lastName: { contains: s, mode: 'insensitive' } } },
        { user: { libraryId: { contains: s, mode: 'insensitive' } } },
      ];
    }

    // Filter by date range
    if (query.fromDate) {
      where.borrowDate = { ...(where.borrowDate || {}), gte: new Date(query.fromDate as string) };
    }
    if (query.toDate) {
      where.borrowDate = { ...(where.borrowDate || {}), lte: new Date(query.toDate as string) };
    }

    const [transactions, total] = await Promise.all([
      prisma.borrowTransaction.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, libraryId: true, role: true } },
          book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true } },
        },
        orderBy: { borrowDate: 'desc' },
        skip,
        take,
      }),
      prisma.borrowTransaction.count({ where }),
    ]);

    return { transactions, meta: buildPaginationMeta(total, { page, limit, skip, take }) };
  }

  /**
   * Get single transaction details
   */
  async getTransaction(transactionId: string) {
    const transaction = await prisma.borrowTransaction.findUnique({
      where: { id: transactionId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, libraryId: true, role: true } },
        book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true, publisher: true, shelf: true, row: true } },
      },
    });
    if (!transaction) throw new NotFoundError('Transaction');
    return transaction;
  }

  /**
   * Pay fine for an overdue/returned transaction
   */
  async payFine(transactionId: string, amount: number) {
    const transaction = await prisma.borrowTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!transaction) throw new NotFoundError('Transaction');
    if (transaction.finePaid) throw new BadRequestError('Fine already paid');
    if (!transaction.fineAmount || transaction.fineAmount <= 0) {
      throw new BadRequestError('No fine to pay');
    }

    if (amount < transaction.fineAmount) {
      throw new BadRequestError(
        `Insufficient payment. Required: ₱${transaction.fineAmount.toFixed(2)}, provided: ₱${amount.toFixed(2)}`
      );
    }

    const updated = await prisma.borrowTransaction.update({
      where: { id: transactionId },
      data: { finePaid: true },
      include: {
        book: { select: { title: true, accessionNo: true } },
        user: { select: { firstName: true, lastName: true, libraryId: true } },
      },
    });

    await prisma.notification.create({
      data: {
        userId: transaction.userId,
        type: 'SYSTEM',
        title: 'Fine Paid',
        message: `Your fine of ₱${transaction.fineAmount.toFixed(2)} for "${updated.book.title}" has been paid.`,
        link: `/transactions/${transactionId}`,
      },
    });

    return updated;
  }

  /**
   * Get active transaction count for a user (for validation)
   */
  async getUserActiveCount(userId: string): Promise<number> {
    return prisma.borrowTransaction.count({
      where: { userId, status: 'ACTIVE' },
    });
  }

  /**
   * Generate a unique QR code for a pending borrow request.
   * The QR encodes a deep-link URL that the borrower scans with their phone.
   * Opening the URL (with a signed, unique token) is what confirms approval —
   * the request is NOT approved when the QR is merely generated.
   */
  async generateApprovalQR(requestId: string, librarianId: string) {
    const request = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      include: {
        book: { select: { id: true, title: true, accessionNo: true } },
        user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
      },
    });
    if (!request) throw new NotFoundError('Borrow request');
    if (request.status !== 'PENDING') {
      throw new BadRequestError('Request has already been processed');
    }

    // Generate the same nine-digit Transaction ID used by direct approvals.
    let approvalCode = '';
    let isUnique = false;
    while (!isUnique) {
      approvalCode = generateApprovalCode();
      
      const existing = await prisma.borrowRequest.findUnique({
        where: { approvalCode },
      });
      isUnique = !existing;
    }

    const token = jwt.sign(
      {
        requestId: request.id,
        approvalCode,
        issuerId: librarianId,
        jti: crypto.randomUUID(),
      },
      env.JWT_SECRET,
      { expiresIn: QR_TOKEN_TTL_SECONDS }
    );
    const tokenExpiresAt = new Date(Date.now() + QR_TOKEN_TTL_SECONDS * 1000);

    await prisma.borrowRequest.update({
      where: { id: requestId },
      data: {
        approvalCode,
        approvalTokenHash: hashQrToken(token),
        approvalTokenExpiresAt: tokenExpiresAt,
        approvalTokenUsedAt: null,
        approvalTokenIssuedById: librarianId,
      },
    });
    const frontendUrl = (env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

    // The deep link the borrower opens on their phone to confirm approval.
    // Include approval code as parameter for manual entry fallback
    const approveUrl = `${frontendUrl}/scan-approve?request=${request.id}&token=${token}&code=${approvalCode}`;
    const qrCodeDataUrl = await generateQRFromText(approveUrl);

    return {
      requestId: request.id,
      approvalCode,
      bookTitle: request.book.title,
      accessionNo: request.book.accessionNo,
      memberName: `${request.user.firstName} ${request.user.lastName}`,
      libraryId: request.user.libraryId,
      qrCode: qrCodeDataUrl,
      approveUrl,
      issuedAt: new Date().toISOString(),
      expiresAt: tokenExpiresAt.toISOString(),
    };
  }

  /**
   * Confirm approval of a borrow request via a scanned QR token or approval code.
   * This is called when the borrower opens the deep link from their phone OR
   * manually enters the transaction ID (approval code).
   * Applies the same logic as approveRequest but is authorized purely by the
   * matching (single-use style) token or approval code.
   */
  async approveByQRCode(requestId: string, token: string, approvalCode?: string) {
    const request = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      include: { book: true, user: true },
    });
    if (!request) throw new NotFoundError('Borrow request');

    if (request.status !== 'PENDING') {
      throw new BadRequestError('Request has already been processed');
    }

    if (approvalCode && request.approvalCode !== approvalCode) {
      throw new BadRequestError('Invalid transaction ID');
    }

    let issuerId = request.approvalTokenIssuedById;
    if (token) {
      let claims: JsonWebTokenPayload;
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        if (typeof decoded === 'string') throw new Error('Invalid token payload');
        claims = decoded;
      } catch {
        throw new BadRequestError('Invalid or expired QR token');
      }
      if (
        claims.requestId !== request.id ||
        claims.approvalCode !== request.approvalCode ||
        claims.issuerId !== request.approvalTokenIssuedById ||
        !request.approvalTokenHash ||
        request.approvalTokenHash !== hashQrToken(token) ||
        !request.approvalTokenExpiresAt ||
        request.approvalTokenExpiresAt <= new Date() ||
        request.approvalTokenUsedAt
      ) {
        throw new BadRequestError('Invalid, expired, or already used QR token');
      }
    } else if (
      !approvalCode ||
      !issuerId ||
      !request.approvalTokenExpiresAt ||
      request.approvalTokenExpiresAt <= new Date() ||
      request.approvalTokenUsedAt
    ) {
      throw new BadRequestError('Invalid, expired, or already used approval code');
    }

    if (!issuerId) throw new BadRequestError('QR approval issuer is missing');

    const issuer = await prisma.user.findUnique({
      where: { id: issuerId },
      select: { id: true, role: true, isActive: true },
    });
    if (!issuer || !issuer.isActive || issuer.role !== Role.LIBRARIAN) {
      throw new BadRequestError('QR approval was not issued by an active librarian');
    }

    const claimed = await prisma.borrowRequest.updateMany({
      where: {
        id: request.id,
        status: 'PENDING',
        approvalCode: request.approvalCode,
        approvalTokenUsedAt: null,
        ...(token ? { approvalTokenHash: hashQrToken(token) } : {}),
      },
      data: { approvalTokenUsedAt: new Date() },
    });
    if (claimed.count !== 1) throw new BadRequestError('QR approval has already been used');

    return this.approveRequest(request.id, issuer.id);
  }

  // ============================================================
  // Reservations
  // ============================================================

  /**
   * Reserve a book
   * - Only for books that are currently unavailable
   * - Respects queue limit
   * - Auto-positions in queue
   */
  async reserveBook(userId: string, bookId: string) {
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundError('Book');

    // Allow reservation even if available (for future-borrow planning)
    // But warn via notification

    const existing = await prisma.reservation.findFirst({
      where: { userId, bookId, status: 'ACTIVE' },
    });
    if (existing) throw new ConflictError('You already have an active reservation for this book');

    // Check if already borrowed
    const activeBorrow = await prisma.borrowTransaction.findFirst({
      where: { userId, bookId, status: 'ACTIVE' },
    });
    if (activeBorrow) throw new ConflictError('You already have this book borrowed');

    // Check queue limit
    const queueLimit = await policyService.getNumber('RESERVATION_QUEUE_LIMIT', 10);
    const activeReservations = await prisma.reservation.count({
      where: { bookId, status: 'ACTIVE' },
    });
    if (activeReservations >= queueLimit) {
      throw new BadRequestError(`Reservation queue is full (max ${queueLimit}) for this book`);
    }

    // Get expiry days
    const maxExpiryDays = await policyService.getNumber('MAX_RESERVATION_DAYS', 3);

    const reservation = await prisma.reservation.create({
      data: {
        userId,
        bookId,
        expiryDate: new Date(Date.now() + maxExpiryDays * 24 * 60 * 60 * 1000),
        queuePosition: activeReservations + 1,
      },
      include: {
        book: { select: { title: true, author: true, accessionNo: true, isbn: true } },
        user: { select: { firstName: true, lastName: true, libraryId: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId,
        action: 'RESERVE_BOOK',
        entity: 'Reservation',
        entityId: reservation.id,
        details: { bookTitle: book.title, queuePosition: reservation.queuePosition },
      },
    });

    return reservation;
  }

  /**
   * Cancel a reservation
   * - Recalculates queue positions
   */
  async cancelReservation(reservationId: string, userId: string) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { book: { select: { title: true } } },
    });
    if (!reservation) throw new NotFoundError('Reservation');
    if (reservation.userId !== userId) throw new BadRequestError('Not your reservation');
    if (reservation.status !== 'ACTIVE') throw new BadRequestError('Reservation already processed');

    await prisma.$transaction([
      prisma.reservation.update({
        where: { id: reservationId },
        data: { status: 'CANCELLED' },
      }),
      prisma.activityLog.create({
        data: {
          userId,
          action: 'CANCEL_RESERVATION',
          entity: 'Reservation',
          entityId: reservationId,
          details: { bookTitle: reservation.book.title },
        },
      }),
    ]);

    // Recalculate positions for remaining reservations of this book
    const remaining = await prisma.reservation.findMany({
      where: { bookId: reservation.bookId, status: 'ACTIVE' },
      orderBy: { queuePosition: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      await prisma.reservation.update({
        where: { id: remaining[i].id },
        data: { queuePosition: i + 1 },
      });
    }
  }

  /**
   * List reservations for a user or all (librarian)
   */
  async listReservations(query: Record<string, unknown>, userId?: string) {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where: any = {};
    if (userId) where.userId = userId;
    if (query.status) where.status = query.status;
    if (query.bookId) where.bookId = query.bookId;

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
          book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true, availableCopies: true, status: true } },
        },
        orderBy: [{ queuePosition: 'asc' }, { reservationDate: 'desc' }],
        skip,
        take,
      }),
      prisma.reservation.count({ where }),
    ]);

    return { reservations, meta: buildPaginationMeta(total, { page, limit, skip, take }) };
  }

  /**
   * Run overdue check — mark transactions as OVERDUE if past due date
   * Called by a cron job or on-demand
   */
  async checkOverdueTransactions() {
    const now = new Date();
    const overdueTransactions = await prisma.borrowTransaction.findMany({
      where: {
        status: 'ACTIVE',
        dueDate: { lt: now },
      },
      include: {
        book: { select: { title: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    for (const txn of overdueTransactions) {
      const diffDays = Math.ceil((now.getTime() - txn.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const finePerDay = await policyService.getFloat('FINE_PER_DAY', 10);
      const fine = diffDays * finePerDay;

      await prisma.$transaction([
        prisma.borrowTransaction.update({
          where: { id: txn.id },
          data: { status: 'OVERDUE', fineAmount: fine },
        }),
        prisma.notification.create({
          data: {
            userId: txn.userId,
            type: 'OVERDUE_FINE',
            title: 'Book Overdue',
            message: `"${txn.book.title}" is ${diffDays} day(s) overdue. Fine: ₱${fine.toFixed(2)}. Please return immediately.`,
            link: `/transactions/${txn.id}`,
          },
        }),
      ]);
    }

    return { processed: overdueTransactions.length };
  }
}

export const transactionService = new TransactionService();

