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

import { Prisma } from '@prisma/client';
import { prisma } from '../config';
import { env } from '../config/env';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination';
import { getSortParams } from '../utils/sorting';
import { generateQRFromText } from '../utils/qrcode';
import { policyService } from './policy.service';
import { notificationService } from './notification.service';
import { Role } from '@prisma/client';
import crypto from 'crypto';

type ActivityRequestContext = { ipAddress?: string; userAgent?: string };

function generateTransactionId(): string {
  return crypto.randomInt(0, 100_000_000).toString().padStart(8, '0');
}

function normalizeBorrowId(value: string): string {
  const input = value.trim().toUpperCase();
  const formattedMatch = /^BRW-(\d{4})-(\d{4})$/.exec(input);
  const transactionId = formattedMatch ? `${formattedMatch[1]}${formattedMatch[2]}` : input;
  if (!/^\d{8}$/.test(transactionId)) {
    throw new BadRequestError('Enter a valid 8-digit Borrow ID');
  }
  return transactionId;
}

function formatBorrowId(transactionId: string): string {
  return `BRW-${transactionId.slice(0, 4)}-${transactionId.slice(4)}`;
}

function buildBorrowVerificationUrl(transactionId: string): string {
  const frontendUrl = (Array.isArray(env.FRONTEND_URL) ? env.FRONTEND_URL[0] : env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${frontendUrl}/scan-approve?borrowId=${encodeURIComponent(formatBorrowId(transactionId))}`;
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

  private async generateUniqueTransactionId(tx: Prisma.TransactionClient): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026093001::bigint)`;
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = generateTransactionId();
      const [existingRequest, existingTransaction] = await Promise.all([
        tx.borrowRequest.findFirst({ where: { transactionId: candidate }, select: { id: true } }),
        tx.borrowTransaction.findFirst({ where: { transactionId: candidate }, select: { id: true } }),
      ]);
      if (!existingRequest && !existingTransaction) return candidate;
    }
    throw new ConflictError('Could not allocate a unique transaction ID. Please retry approval.');
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
    auditContext?: ActivityRequestContext;
  }) {
    const { userId, bookIds, notes, auditContext } = input;
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

    const requestBatchId = crypto.randomUUID();
    const created = await prisma.$transaction(async (tx) => {
      const books = await tx.$queryRaw<Array<{ id: string; title: string; status: string; availableCopies: number }>>`
        SELECT id, title, status, available_copies AS "availableCopies"
        FROM books
        WHERE id = ANY (${uniqueBookIds})
        FOR UPDATE
      `;

      if (books.length !== uniqueBookIds.length) {
        throw new NotFoundError('One or more books');
      }

      const bookMap = new Map(books.map((book) => [book.id, book]));
      for (const bookId of uniqueBookIds) {
        const book = bookMap.get(bookId);
        if (!book) throw new NotFoundError('One or more books');
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

      const existingRequests = await tx.borrowRequest.findMany({
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
        const activeTxns = await tx.borrowTransaction.count({
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

      const existingActive = await tx.borrowTransaction.findFirst({
        where: { userId, bookId: { in: uniqueBookIds }, status: 'ACTIVE' },
      });
      if (existingActive) {
        throw new ConflictError('You already have one of these books borrowed');
      }

      const activeCount = await tx.borrowTransaction.count({
        where: { userId, status: 'ACTIVE' },
      });

      let maxBooks: number;
      if (user.role === Role.STUDENT) {
        maxBooks = user.maxBooksAllowed ?? (await policyService.getNumber('MAX_BOOKS_PER_USER', 3));
      } else if (user.role === Role.FACULTY) {
        maxBooks = user.maxBooksAllowed ?? (await policyService.getNumber('FACULTY_MAX_BOOKS', 10));
      } else {
        maxBooks = 999;
      }

      if (activeCount + uniqueBookIds.length > maxBooks) {
        throw new BadRequestError(
          `You have reached the maximum limit of ${maxBooks} active borrows. Return a book first.`
        );
      }

      const created: any[] = [];
      for (const bookId of uniqueBookIds) {
        const request = await tx.borrowRequest.create({
          data: { userId, bookId, notes, requestBatchId },
          include: {
            book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true } },
            user: { select: { firstName: true, lastName: true, libraryId: true, role: true } },
          },
        });

        created.push(request);
      }

      return created;
    }, {
      timeout: 20000,
      maxWait: 20000,
    });

    const requesterName = `${user.firstName} ${user.lastName}`;
    const bookCount = uniqueBookIds.length;
    const bookTitles = created
      .map((request) => request.book.title)
      .join(', ');

    await Promise.all(
      created.map((request) =>
        prisma.activityLog.create({
          data: {
            userId,
            action: 'BORROW_REQUEST',
            entity: 'BorrowRequest',
            entityId: request.id,
            ipAddress: auditContext?.ipAddress,
            details: {
              bookTitle: request.book.title,
              bookId: request.bookId,
              requestBatchId,
              ...(notes ? { notes } : {}),
              ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
              status: 'PENDING',
            },
          },
        })
      )
    );

    await notificationService.notifyAllLibrarians(
      'BORROW_CONFIRMATION',
      'New Borrow Request',
      `${requesterName} requested to borrow ${bookCount} book${bookCount > 1 ? 's' : ''}${bookCount === 1 ? ` (${bookTitles})` : ''}`,
      '/requests'
    );

    return {
      requests: created.map(({ requestBatchId: _requestBatchId, transactionId: _transactionId, ...request }) => request),
    };
  }

  /**
  * Stage a Borrow ID for a pending request (librarian only) without activating the borrow.
   */
  async approveRequest(requestId: string, librarianId: string, auditContext?: ActivityRequestContext) {
    const request = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      select: { id: true, requestBatchId: true, transactionId: true },
    });
    if (!request) throw new NotFoundError('Borrow request');
    return this.approveTransactionBatch(
      request.requestBatchId || request.transactionId || request.id,
      librarianId,
      auditContext
    );
  }

  async approveTransactionBatch(requestBatchId: string, librarianId: string, auditContext?: ActivityRequestContext) {
    const requestBatchWhere = {
      OR: [
        { requestBatchId },
        { transactionId: requestBatchId },
        { id: requestBatchId },
      ],
    };
    const requests = await prisma.borrowRequest.findMany({
      where: requestBatchWhere,
      include: {
        book: true,
        user: true,
      },
      orderBy: { requestDate: 'asc' },
    });
    if (!requests.length) throw new NotFoundError('Borrow transaction request');
    if (requests.length > TransactionService.MAX_BOOKS_PER_TRANSACTION) {
      throw new BadRequestError('This transaction exceeds the maximum of 3 books');
    }
    const user = requests[0].user;
    if (requests.some((request) => request.userId !== user.id)) {
      throw new BadRequestError('Transaction request contains multiple members');
    }
    if (requests.some((request) => request.status !== 'PENDING')) {
      throw new BadRequestError('This transaction has already been processed');
    }
    const existingTransactionId = requests[0].transactionId;
    if (existingTransactionId || requests.some((request) => request.transactionId)) {
      if (!existingTransactionId || requests.some((request) => request.transactionId !== existingTransactionId)) {
        throw new BadRequestError('This request batch has an invalid Borrow ID');
      }
      return {
        transactionId: existingTransactionId,
        qrCode: await generateQRFromText(buildBorrowVerificationUrl(existingTransactionId)),
        requests,
      };
    }

    const transactionId = await prisma.$transaction(async (tx) => {
      const allocatedId = await this.generateUniqueTransactionId(tx);
      const claimed = await tx.borrowRequest.updateMany({
        where: { ...requestBatchWhere, status: 'PENDING', transactionId: null },
        data: {
          transactionId: allocatedId,
          processedById: librarianId,
          processedAt: null,
        },
      });
      if (claimed.count !== requests.length) {
        const currentRequests = await tx.borrowRequest.findMany({
          where: requestBatchWhere,
          select: { status: true, transactionId: true },
        });
        const currentTransactionId = currentRequests[0]?.transactionId;
        if (
          currentRequests.length === requests.length &&
          currentTransactionId &&
          currentRequests.every((currentRequest) =>
            currentRequest.status === 'PENDING' && currentRequest.transactionId === currentTransactionId
          )
        ) {
          return currentTransactionId;
        }
        throw new BadRequestError('This transaction has already been processed');
      }
      return allocatedId;
    });
    const stagedRequests = await prisma.borrowRequest.findMany({
      where: { transactionId },
      include: {
        book: { select: { id: true, title: true, accessionNo: true } },
        user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
      },
      orderBy: { requestDate: 'asc' },
    });
    await prisma.activityLog.create({
      data: {
        userId: librarianId,
        action: 'APPROVE_REQUEST',
        entity: 'BorrowRequest',
        entityId: transactionId,
        ipAddress: auditContext?.ipAddress,
        details: {
          transactionId,
          borrowerName: `${user.firstName} ${user.lastName}`,
          bookTitles: stagedRequests.map((request) => request.book.title),
          status: 'Awaiting borrower verification',
          ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
        },
      },
    });

    return {
      transactionId,
      qrCode: await generateQRFromText(buildBorrowVerificationUrl(transactionId)),
      requests: stagedRequests,
    };
  }

  async verifyBorrowRequest(borrowId: string, userId: string, auditContext?: ActivityRequestContext) {
    const transactionId = normalizeBorrowId(borrowId);
    const requests = await prisma.borrowRequest.findMany({
      where: { transactionId },
      include: {
        book: true,
        user: { select: { id: true, firstName: true, lastName: true, libraryId: true, role: true, maxBorrowDays: true, maxBooksAllowed: true } },
      },
      orderBy: { requestDate: 'asc' },
    });
    if (!requests.length || requests.some((request) => request.userId !== userId)) {
      throw new NotFoundError('Pending Borrow ID');
    }
    if (requests.some((request) => request.status !== 'PENDING')) {
      throw new BadRequestError('This Borrow ID is not pending or has already been verified');
    }
    if (requests.length > TransactionService.MAX_BOOKS_PER_TRANSACTION) {
      throw new BadRequestError('This transaction exceeds the maximum of 3 books');
    }

    const user = requests[0].user;
    const borrowDate = new Date();
    const dueDate = await this.calculateBorrowDueDate(user, borrowDate);
    const maxBooks = user.role === Role.STUDENT
      ? user.maxBooksAllowed ?? await policyService.getNumber('MAX_BOOKS_PER_USER', 3)
      : user.role === Role.FACULTY
        ? user.maxBooksAllowed ?? await policyService.getNumber('FACULTY_MAX_BOOKS', 10)
        : 999;
    const bookIds = requests.map((request) => request.bookId);

    const transactions = await prisma.$transaction(async (tx) => {
      const claimed = await tx.borrowRequest.updateMany({
        where: { transactionId, userId, status: 'PENDING' },
        data: { status: 'APPROVED', processedAt: borrowDate },
      });
      if (claimed.count !== requests.length) {
        throw new BadRequestError('This Borrow ID has already been verified');
      }

      const books = await tx.$queryRaw<Array<{ id: string; title: string; availableCopies: number }>>`
        SELECT id, title, available_copies AS "availableCopies"
        FROM books
        WHERE id = ANY (${bookIds})
        FOR UPDATE
      `;
      if (books.length !== bookIds.length) throw new NotFoundError('One or more books');
      const bookMap = new Map(books.map((book) => [book.id, book]));
      for (const bookId of bookIds) {
        const book = bookMap.get(bookId);
        if (!book || book.availableCopies < 1) {
          throw new BadRequestError(`No copies available for "${book?.title || 'a requested book'}"`);
        }
      }

      const activeCount = await tx.borrowTransaction.count({
        where: { userId, status: { in: ['ACTIVE', 'OVERDUE'] } },
      });
      if (activeCount + requests.length > maxBooks) {
        throw new BadRequestError(`You have reached the maximum limit of ${maxBooks} active borrows`);
      }

      const createdTransactions = await Promise.all(requests.map((request) =>
        tx.borrowTransaction.create({
          data: {
            userId,
            bookId: request.bookId,
            transactionId,
            borrowDate,
            dueDate,
            status: 'ACTIVE',
            notes: request.notes || undefined,
          },
          include: {
            book: { select: { title: true, accessionNo: true, isbn: true, shelf: true, row: true } },
            user: { select: { id: true, firstName: true, lastName: true, libraryId: true, avatar: true, role: true } },
          },
        })
      ));

      await Promise.all(books.map((book) => tx.book.update({
        where: { id: book.id },
        data: {
          availableCopies: { decrement: 1 },
          status: book.availableCopies - 1 <= 0 ? 'BORROWED' : 'AVAILABLE',
        },
      })));

      await tx.notification.create({
        data: {
          userId,
          type: 'REQUEST_APPROVED',
          title: 'Borrow Transaction Approved',
          message: `Your request for ${requests.length} book(s) is approved. Due date: ${dueDate.toLocaleDateString()}.`,
          link: '/transactions',
        },
      });
      await tx.activityLog.create({
        data: {
          userId,
          action: 'BORROW_CONFIRMATION',
          entity: 'BorrowRequest',
          entityId: transactionId,
          ipAddress: auditContext?.ipAddress,
          details: {
            transactionId,
            borrowerName: `${user.firstName} ${user.lastName}`,
            bookTitles: requests.map((request) => request.book.title),
            dueDate,
            status: 'Verified',
            ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
          },
        },
      });
      return createdTransactions;
    }, { timeout: 20000, maxWait: 20000 });

    for (const request of requests) {
      const reservation = await prisma.reservation.findFirst({
        where: { bookId: request.bookId, status: 'ACTIVE', userId },
      });
      if (reservation) {
        await prisma.reservation.update({
          where: { id: reservation.id },
          data: { status: 'FULFILLED', notified: true },
        });
      }
      const remainingReservations = await prisma.reservation.findMany({
        where: { bookId: request.bookId, status: 'ACTIVE' },
        orderBy: { queuePosition: 'asc' },
      });
      for (let index = 0; index < remainingReservations.length; index++) {
        await prisma.reservation.update({
          where: { id: remainingReservations[index].id },
          data: { queuePosition: index + 1 },
        });
      }
    }

    return { transactionId, dueDate, transactions };
  }

  /**
   * Reject a borrow request (with reason)
   */
  async rejectRequest(requestId: string, librarianId: string, reason: string, auditContext?: ActivityRequestContext) {
    const request = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      include: { book: true },
    });
    if (!request) throw new NotFoundError('Borrow request');
    if (request.status !== 'PENDING') {
      throw new BadRequestError('Request already processed');
    }

    if (request.transactionId) {
      const requests = await prisma.borrowRequest.findMany({
        where: { transactionId: request.transactionId },
        include: { book: { select: { title: true } } },
      });
      if (requests.some((entry) => entry.status !== request.status)) {
        throw new BadRequestError('This transaction has already been processed');
      }
      const bookTitles = requests.map((entry) => entry.book.title).join(', ');
      await prisma.$transaction([
        prisma.borrowRequest.updateMany({
          where: { transactionId: request.transactionId, status: request.status },
          data: { status: 'REJECTED', processedById: librarianId, processedAt: new Date(), notes: reason },
        }),
        prisma.notification.create({
          data: {
            userId: request.userId,
            type: 'REQUEST_REJECTED',
            title: 'Borrow Transaction Rejected',
            message: `Your request for ${bookTitles} was rejected. Reason: ${reason}`,
            link: '/requests',
          },
        }),
        prisma.activityLog.create({
          data: {
            userId: librarianId,
            action: 'REJECT_REQUEST',
            entity: 'BorrowRequest',
            entityId: request.transactionId,
            ipAddress: auditContext?.ipAddress,
            details: {
              transactionId: request.transactionId,
              bookTitles,
              reason,
              status: 'Rejected',
              ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
            },
          },
        }),
      ]);
      return;
    }

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
          ipAddress: auditContext?.ipAddress,
          details: {
            bookTitle: request.book.title,
            reason,
            status: 'Rejected',
            ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
          },
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

  async getBorrowRequestBatch(transactionId: string, userId?: string) {
    const requests = await prisma.borrowRequest.findMany({
      where: { transactionId, ...(userId ? { userId } : {}) },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, libraryId: true, role: true, maxBorrowDays: true } },
        book: { select: { id: true, title: true, author: true, accessionNo: true } },
      },
      orderBy: { requestDate: 'asc' },
    });
    if (!requests.length) throw new NotFoundError('Borrow transaction');
    if (requests.some((request) => request.status !== 'APPROVED')) {
      throw new NotFoundError('Borrow transaction');
    }

    const transactions = await prisma.borrowTransaction.findMany({
      where: { transactionId },
      select: { bookId: true, dueDate: true, status: true },
    });
    const transactionStatuses = Array.from(new Set(transactions.map((transaction) => transaction.status)));

    return {
      transactionId,
      status: transactionStatuses.length === 1 ? transactionStatuses[0] : 'PARTIALLY_RETURNED',
      user: requests[0].user,
      books: requests.map((request) => ({
        requestId: request.id,
        bookId: request.bookId,
        title: request.book.title,
        author: request.book.author,
        accessionNo: request.book.accessionNo,
        status: transactions.find((transaction) => transaction.bookId === request.bookId)?.status ?? request.status,
        dueDate: transactions.find((transaction) => transaction.bookId === request.bookId)?.dueDate ?? null,
      })),
    };
  }

  /**
   * List borrow requests (with filters)
   */
async listBorrowRequests(query: Record<string, unknown>, userId?: string) {
    const pagination = getPaginationParams(query);
    const { sort, order } = getSortParams(query, ['requestDate', 'status', 'memberName'] as const, 'status', 'asc');
    const where: any = {};
    if (userId) where.userId = userId;
    if (query.status) {
      const requestedStatus = String(query.status).trim().toUpperCase();
      const normalizedStatus = requestedStatus === 'AWAITING_PICKUP' ? 'PENDING' : requestedStatus;
      if (!['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(normalizedStatus)) {
        throw new BadRequestError('Invalid borrow request status');
      }
      where.status = normalizedStatus;
    }

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
        { transactionId: { contains: s, mode: 'insensitive' } },
      ];
    }

    const include = {
      user: { select: { id: true, firstName: true, lastName: true, libraryId: true, avatar: true, role: true } },
      book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true } },
      processedBy: { select: { id: true, firstName: true, lastName: true } },
    } as const;
    const matchingRows = await prisma.borrowRequest.findMany({
      where,
      include,
      orderBy: [{ requestDate: order }, { id: 'asc' }],
    });
    const transactionIds = Array.from(new Set(matchingRows
      .map((request) => request.transactionId)
      .filter((id): id is string => Boolean(id))));
    const siblingRows = transactionIds.length
      ? await prisma.borrowRequest.findMany({
        where: { transactionId: { in: transactionIds }, ...(userId ? { userId } : {}) },
        include,
      })
      : [];
    const allRows = Array.from(new Map([...matchingRows, ...siblingRows].map((request) => [request.id, request])).values());
    const grouped = new Map<string, typeof allRows>();
    for (const request of allRows) {
      const key = request.requestBatchId || request.transactionId || `legacy:${request.id}`;
      const group = grouped.get(key) || [];
      group.push(request);
      grouped.set(key, group);
    }

    const statusOrder: Record<string, number> = {
      PENDING: 0,
      APPROVED: 1,
      REJECTED: 2,
    };
    const direction = order === 'asc' ? 1 : -1;
    const requests = Array.from(grouped.values()).map((group) => {
      group.sort((a, b) => a.requestDate.getTime() - b.requestDate.getTime());
      const first = group[0];
      return {
        id: first.id,
        ...(!userId ? { requestBatchId: first.requestBatchId, transactionId: first.transactionId } : {}),
        user: first.user,
        status: first.status,
        requestDate: first.requestDate,
        notes: first.notes,
        books: group.map((request) => ({ ...request.book, requestId: request.id, status: request.status })),
      };
    });

    requests.sort((a, b) => {
      if (sort === 'status') {
        const statusDifference = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
        if (statusDifference) return statusDifference * direction;
      }
      if (sort === 'memberName') {
        const aName = `${a.user.firstName} ${a.user.lastName}`;
        const bName = `${b.user.firstName} ${b.user.lastName}`;
        const nameDifference = aName.localeCompare(bName);
        if (nameDifference) return nameDifference * direction;
      }
      return (a.requestDate.getTime() - b.requestDate.getTime()) * direction || a.id.localeCompare(b.id);
    });

    const total = requests.length;
    return {
      requests: requests.slice(pagination.skip, pagination.skip + pagination.take),
      meta: buildPaginationMeta(total, pagination),
    };
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
  async returnBook(transactionIdOrQr: string, actorUserId?: string, auditContext?: ActivityRequestContext) {
    await this.synchronizeOverdueTransactions();
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
            status: { in: ['ACTIVE', 'OVERDUE'] },
          },
          include: { book: true, user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { borrowDate: 'desc' },
        });
      }
    }

    if (!transaction) throw new NotFoundError('Active transaction for this book');
    if (transaction.returnDate) throw new BadRequestError('Book already returned');

    const now = new Date();
    const isOverdue = now >= new Date(transaction.dueDate.getFullYear(), transaction.dueDate.getMonth(), transaction.dueDate.getDate() + 1);

    // Calculate fine
    let fineAmount = 0;
    if (isOverdue) {
      const finePerDay = await policyService.getFloat('FINE_PER_DAY', 5);
      const dueStart = new Date(transaction.dueDate.getFullYear(), transaction.dueDate.getMonth(), transaction.dueDate.getDate());
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.floor((todayStart.getTime() - dueStart.getTime()) / (1000 * 60 * 60 * 24));
      fineAmount = diffDays * finePerDay;
    }

    const [updated] = await prisma.$transaction([
      prisma.borrowTransaction.update({
        where: { id: transaction.id },
        data: {
          returnDate: now,
          status: 'RETURNED',
          fineAmount,
          fineWaived: fineAmount > 0 && !transaction.finePaid,
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
          userId: actorUserId || transaction.userId,
          action: 'RETURN_BOOK',
          entity: 'BorrowTransaction',
          entityId: transaction.id,
          ipAddress: auditContext?.ipAddress,
          details: {
            bookTitle: transaction.book.title,
            accessionNo: transaction.book.accessionNo,
            isOverdue,
            fineAmount,
            status: 'Returned',
            ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
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

    // Returning the book waives any overdue fine.
    if (fineAmount > 0 && !transaction.finePaid) {
      await prisma.notification.create({
        data: {
          userId: transaction.userId,
          type: 'OVERDUE_FINE',
          title: 'Overdue Fine Waived',
          message: `Your overdue fine of ₱${fineAmount.toFixed(2)} for "${transaction.book.title}" was waived when the book was returned.`,
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
    await this.synchronizeOverdueTransactions();
    const { page, limit, skip, take } = getPaginationParams(query);
  const { sort, order } = getSortParams(query, ['borrowDate', 'dueDate', 'status', 'fineAmount'] as const, 'status', 'asc');
    const where: any = {};
    if (userId) where.userId = userId;
    const statusValues = query.status
      ? String(query.status).split(',').map((status) => status.trim()).filter(Boolean)
      : [];
    if (statusValues.length === 1) where.status = statusValues[0];
    if (statusValues.length > 1) where.status = { in: statusValues };

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

    const orderedIds = sort === 'status'
      ? await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT bt.id
          FROM borrow_transactions bt
          JOIN users u ON u.id = bt.user_id
          JOIN books b ON b.id = bt.book_id
          WHERE (${userId ?? null}::text IS NULL OR bt.user_id = ${userId ?? null})
            AND (${statusValues.length ? statusValues.join(',') : null}::text IS NULL OR bt.status::text = ANY(string_to_array(${statusValues.length ? statusValues.join(',') : null}::text, ',')))
            AND (${query.search ? `%${String(query.search)}%` : null}::text IS NULL OR
              b.title ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
              b.accession_no ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
              b.author ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
              u.first_name ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
              u.last_name ILIKE ${query.search ? `%${String(query.search)}%` : null} OR
              u.library_id ILIKE ${query.search ? `%${String(query.search)}%` : null})
            AND (${query.fromDate ?? null}::timestamptz IS NULL OR bt.borrow_date >= ${query.fromDate ? new Date(String(query.fromDate)) : null})
            AND (${query.toDate ?? null}::timestamptz IS NULL OR bt.borrow_date <= ${query.toDate ? new Date(String(query.toDate)) : null})
          ORDER BY CASE bt.status::text WHEN 'OVERDUE' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END ${Prisma.raw(order.toUpperCase())},
            bt.due_date ASC, bt.id ASC
          LIMIT ${take} OFFSET ${skip}
        `
      : null;

    const [transactionRows, total] = await Promise.all([
      prisma.borrowTransaction.findMany({
        include: {
          user: { select: { id: true, firstName: true, lastName: true, libraryId: true, avatar: true, role: true } },
          book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true } },
        },
        orderBy: sort === 'status'
          ? { id: 'asc' }
          : [{ [sort]: order }, { id: 'asc' }],
        ...(orderedIds
          ? { where: { ...where, id: { in: orderedIds.map(({ id }) => id) } } }
          : { where, skip, take }),
      }),
      prisma.borrowTransaction.count({ where }),
    ]);

    const transactionMap = new Map(transactionRows.map((transaction) => [transaction.id, transaction]));
    const transactions = orderedIds
      ? orderedIds.map(({ id }) => transactionMap.get(id)).filter((transaction) => transaction !== undefined)
      : transactionRows;

    return { transactions, meta: buildPaginationMeta(total, { page, limit, skip, take }) };
  }

  /**
   * Get single transaction details
   */
  async getTransaction(transactionId: string) {
    await this.synchronizeOverdueTransactions();
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

  /** Mark active transactions past their due date and calculate current fines. */
  async synchronizeOverdueTransactions() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const finePerDay = await policyService.getFloat('FINE_PER_DAY', 5);
    return prisma.$executeRaw`
      UPDATE borrow_transactions
      SET status = 'OVERDUE',
          fine_amount = GREATEST(0, (${todayStart}::date - due_date::date)) * ${finePerDay}
      WHERE status IN ('ACTIVE', 'OVERDUE')
        AND due_date < ${todayStart}
        AND return_date IS NULL
    `;
  }

  /**
   * Pay fine for an overdue/returned transaction
   */
  async payFine(transactionId: string, amount: number) {
    const transaction = await prisma.borrowTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!transaction) throw new NotFoundError('Transaction');
    if (transaction.fineWaived) throw new BadRequestError('Fine was waived when the book was returned');
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

  /** Stage the request and return its Borrow ID QR without activating a borrow. */
  async generateApprovalQR(requestId: string, librarianId: string) {
    const request = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      select: { id: true, requestBatchId: true, transactionId: true },
    });
    if (!request) throw new NotFoundError('Borrow request');
    const receipt = await this.approveTransactionBatch(
      request.requestBatchId || request.transactionId || request.id,
      librarianId
    );
    const firstRequest = receipt.requests[0];

    return {
      requestId: request.id,
      transactionId: receipt.transactionId,
      approvalCode: formatBorrowId(receipt.transactionId),
      bookTitle: firstRequest.book.title,
      accessionNo: firstRequest.book.accessionNo,
      memberName: `${firstRequest.user.firstName} ${firstRequest.user.lastName}`,
      libraryId: firstRequest.user.libraryId,
      qrCode: receipt.qrCode,
    };
  }

  /** Confirm the Borrow ID for the authenticated borrower and activate the batch. */
  async approveByQRCode(requestId: string, _token: string | undefined, approvalCode: string | undefined, userId: string) {
    const request = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, status: true, transactionId: true },
    });
    if (!request) throw new NotFoundError('Borrow request');
    if (request.userId !== userId) throw new NotFoundError('Pending Borrow ID');
    if (!approvalCode || request.status !== 'PENDING' || !request.transactionId) {
      throw new BadRequestError('This request is not pending or has no Borrow ID');
    }
    if (normalizeBorrowId(approvalCode) !== request.transactionId) {
      throw new BadRequestError('Invalid Borrow ID');
    }
    return this.verifyBorrowRequest(approvalCode, userId);
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
  async reserveBook(userId: string, bookId: string, auditContext?: ActivityRequestContext) {
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
        ipAddress: auditContext?.ipAddress,
        details: {
          bookTitle: book.title,
          queuePosition: reservation.queuePosition,
          status: 'Reserved',
          ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
        },
      },
    });

    return reservation;
  }

  /**
   * Cancel a reservation
   * - Recalculates queue positions
   */
  async cancelReservation(reservationId: string, userId: string, auditContext?: ActivityRequestContext) {
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
          ipAddress: auditContext?.ipAddress,
          details: {
            bookTitle: reservation.book.title,
            status: 'Cancelled',
            ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
          },
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
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const overdueTransactions = await prisma.borrowTransaction.findMany({
      where: {
        status: 'ACTIVE',
        dueDate: { lt: todayStart },
        returnDate: null,
      },
      include: {
        book: { select: { title: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.synchronizeOverdueTransactions();

    for (const txn of overdueTransactions) {
      const finePerDay = await policyService.getFloat('FINE_PER_DAY', 5);
      const dueStart = new Date(txn.dueDate.getFullYear(), txn.dueDate.getMonth(), txn.dueDate.getDate());
      const diffDays = Math.floor((todayStart.getTime() - dueStart.getTime()) / (1000 * 60 * 60 * 24));
      const fine = Math.max(0, diffDays) * finePerDay;

      await prisma.notification.create({
        data: {
          userId: txn.userId,
          type: 'OVERDUE_FINE',
          title: 'Book Overdue',
          message: `"${txn.book.title}" is ${diffDays} day(s) overdue. Fine: ₱${fine.toFixed(2)}. Please return immediately.`,
          link: `/transactions/${txn.id}`,
        },
      });
    }

    return { processed: overdueTransactions.length };
  }
}

export const transactionService = new TransactionService();

