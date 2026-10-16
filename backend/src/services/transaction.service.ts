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
import { Role } from '@prisma/client';
import { prisma } from '../config';
import { env } from '../config/env';
import { NotFoundError, BadRequestError, ConflictError, ForbiddenError } from '../utils/errors';
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination';
import { getSortParams } from '../utils/sorting';
import { generateQRFromText } from '../utils/qrcode';
import { policyService } from './policy.service';
import { notificationService } from './notification.service';
import { sendPushToUser } from './push.service';
import { recordActivity } from './activity-log.service';
import crypto from 'crypto';

type ActivityRequestContext = { ipAddress?: string; userAgent?: string };

const FINE_PER_BOOK_PER_DAY = 5;
const BORROW_APPROVAL_TOKEN_TTL_MS = 5 * 60 * 1000;

type LinkedBorrowRecord<T extends {
  userId: string | null;
  bookId: string | null;
  user: unknown;
  book: unknown;
}> = T & {
  userId: string;
  bookId: string;
  user: NonNullable<T['user']>;
  book: NonNullable<T['book']>;
};

function assertLinkedBorrowRecord<T extends {
  userId: string | null;
  bookId: string | null;
  user: unknown;
  book: unknown;
}>(record: T): asserts record is LinkedBorrowRecord<T> {
  if (!record.userId || !record.bookId || !record.user || !record.book) {
    throw new BadRequestError('This archived record no longer has an active user and book link');
  }
}

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

function buildBorrowVerificationUrl(transactionId: string, requestId: string, token: string): string {
  const frontendUrl = (Array.isArray(env.FRONTEND_URL) ? env.FRONTEND_URL[0] : env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const url = new URL('/scan-approve', frontendUrl);
  url.searchParams.set('request', requestId);
  url.searchParams.set('token', token);
  url.searchParams.set('code', formatBorrowId(transactionId));
  return url.toString();
}

export class TransactionService {
  // ============================================================
  // Borrow Requests
  // ============================================================

  /**
   * Maximum number of books allowed per transaction / request.
   */
  static readonly MAX_BOOKS_PER_TRANSACTION = 3;

  private async acquireIdempotencyRecord(
    tx: Prisma.TransactionClient,
    userId: string,
    key: string,
    operation: string,
    requestHash: string
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${key}))`;
    const existing = await tx.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (existing && (existing.operation !== operation || existing.requestHash !== requestHash)) {
      throw new ConflictError('This idempotency key was already used for a different request.');
    }
    return existing;
  }

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

  static getReservationRolePriority(role?: Role | null): number {
    switch (role) {
      case Role.FACULTY:
        return 0;
      case Role.STUDENT:
        return 1;
      default:
        return 2;
    }
  }

  static sortReservationsByPriority<T extends { user?: { role?: Role | null } | null; reservationDate?: Date | string | null; id?: string | null }>(
    a: T,
    b: T
  ): number {
    const priorityDelta = TransactionService.getReservationRolePriority(a.user?.role) - TransactionService.getReservationRolePriority(b.user?.role);
    if (priorityDelta !== 0) return priorityDelta;

    const aTime = a.reservationDate ? new Date(a.reservationDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.reservationDate ? new Date(b.reservationDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;

    const aId = a.id ?? '';
    const bId = b.id ?? '';
    return aId.localeCompare(bId);
  }

  private async recalculateReservationQueueForBook(bookId: string, tx: Prisma.TransactionClient) {
    await tx.reservation.updateMany({
      where: {
        bookId,
        status: { in: ['ACTIVE', 'APPROVED'] },
        expiryDate: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    const activeReservations = await tx.reservation.findMany({
      where: { bookId, status: 'ACTIVE' },
      include: { user: { select: { role: true } } },
      orderBy: [{ user: { role: 'asc' } }, { reservationDate: 'asc' }, { id: 'asc' }],
    });

    const ordered = [...activeReservations].sort(TransactionService.sortReservationsByPriority);
    for (let index = 0; index < ordered.length; index += 1) {
      const nextReservation = ordered[index];
      if (nextReservation.queuePosition !== index + 1) {
        await tx.reservation.update({
          where: { id: nextReservation.id },
          data: { queuePosition: index + 1 },
        });
      }
    }
  }

  private async lockReservationBooks(bookIds: string[], tx: Prisma.TransactionClient) {
    for (const bookId of Array.from(new Set(bookIds)).sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookId})::bigint)`;
    }
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
    idempotencyKey?: string;
  }) {
    const { userId, bookIds, notes, auditContext, idempotencyKey } = input;
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
    const requestHash = crypto.createHash('sha256')
      .update(JSON.stringify({ bookIds: uniqueBookIds, notes: notes ?? null }))
      .digest('hex');
    let replayed = false;
    const created = await prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await this.acquireIdempotencyRecord(
          tx,
          userId,
          idempotencyKey,
          'CREATE_BORROW_REQUEST',
          requestHash
        );
        if (existing) {
          replayed = true;
          return tx.borrowRequest.findMany({
            where: { userId, requestBatchId: existing.resourceId },
            include: {
              book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true } },
              user: { select: { firstName: true, lastName: true, libraryId: true, role: true } },
            },
            orderBy: { createdAt: 'asc' },
          });
        }
      }

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
        if (!['AVAILABLE', 'BORROWED'].includes(book.status)) {
          throw new BadRequestError(`"${book.title}" is not currently available for borrowing`);
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
        const approvedBookIds = approvedRequests.flatMap((r) => r.bookId ? [r.bookId] : []);
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

      if (idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            userId,
            key: idempotencyKey,
            operation: 'CREATE_BORROW_REQUEST',
            requestHash,
            resourceId: requestBatchId,
          },
        });
      }

      return created;
    }, {
      timeout: 20000,
      maxWait: 20000,
    });

    if (replayed) {
      return {
        requests: created.map(({ requestBatchId: _requestBatchId, transactionId: _transactionId, ...request }) => request),
      };
    }

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

  async cancelBorrowRequests(requestIds: string[], userId: string, auditContext?: ActivityRequestContext) {
    const ids = Array.from(new Set(requestIds));
    if (!ids.length || ids.length > 50 || ids.length !== requestIds.length) {
      throw new BadRequestError('Select between 1 and 50 unique borrow requests to cancel');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const requests = await tx.borrowRequest.findMany({
          where: { id: { in: ids }, userId },
          include: { book: { select: { title: true } } },
        });
        if (requests.length !== ids.length) {
          throw new BadRequestError('One or more selected borrow requests do not belong to you or no longer exist');
        }
        if (requests.some((request) => request.status !== 'PENDING')) {
          throw new BadRequestError('Only pending borrow requests can be cancelled. Refresh the list and try again.');
        }

        const bookIds = requests.flatMap((request) => request.bookId ? [request.bookId] : []);
        const checkedOut = bookIds.length
          ? await tx.borrowTransaction.findFirst({
            where: {
              userId,
              bookId: { in: bookIds },
              status: { in: ['ACTIVE', 'OVERDUE', 'MISSING'] },
              returnDate: null,
            },
            select: { id: true },
          })
          : null;
        if (checkedOut) {
          throw new BadRequestError('A request for a book currently in your possession cannot be cancelled');
        }

        const updated = await tx.borrowRequest.updateMany({
          where: { id: { in: ids }, userId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        if (updated.count !== ids.length) {
          throw new ConflictError('One or more requests were processed at the same time. Refresh and try again.');
        }

        await tx.activityLog.createMany({
          data: requests.map((request) => ({
            userId,
            action: 'CANCEL_BORROW_REQUEST',
            entity: 'BorrowRequest',
            entityId: request.id,
            ipAddress: auditContext?.ipAddress,
            details: {
              bookTitle: request.book?.title || 'Deleted book',
              status: 'Cancelled',
              ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
            },
          })),
        });

        return {
          cancelled: requests.map((request) => ({
            id: request.id,
            title: request.book?.title || 'Deleted book',
          })),
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictError('Your selected requests changed while being cancelled. Refresh the list and try again.');
      }
      throw error;
    }
  }

  async approveTransactionBatch(requestBatchId: string, librarianId: string, auditContext?: ActivityRequestContext) {
    const requestBatchWhere = {
      OR: [
        { requestBatchId },
        { transactionId: requestBatchId },
        { id: requestBatchId },
      ],
    };
    const batchRequests = await prisma.borrowRequest.findMany({
      where: requestBatchWhere,
      include: {
        book: true,
        user: true,
      },
      orderBy: { requestDate: 'asc' },
    });
    if (!batchRequests.length) throw new NotFoundError('Borrow transaction request');
    if (batchRequests.length > TransactionService.MAX_BOOKS_PER_TRANSACTION) {
      throw new BadRequestError('This transaction exceeds the maximum of 3 books');
    }
    const requests = batchRequests.filter((request) => request.status === 'PENDING');
    if (!requests.length) throw new BadRequestError('This transaction has no pending requests to approve');
    if (batchRequests.some((request) => !['PENDING', 'CANCELLED'].includes(request.status))) {
      throw new BadRequestError('This transaction has already been processed');
    }
    for (const request of requests) assertLinkedBorrowRecord(request);
    const user = requests[0].user;
    if (!user) throw new BadRequestError('The archived user cannot approve this request');
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
      const approvalQr = await this.generateBorrowApprovalQr(existingTransactionId, librarianId);
      return {
        transactionId: existingTransactionId,
        requestId: approvalQr.requestId,
        qrCode: approvalQr.qrCode,
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
        const currentPending = currentRequests.filter((currentRequest) => currentRequest.status === 'PENDING');
        const currentTransactionId = currentPending[0]?.transactionId;
        if (
          currentPending.length === requests.length &&
          currentTransactionId &&
          currentPending.every((currentRequest) =>
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
      where: { transactionId, status: 'PENDING' },
      include: {
        book: { select: { id: true, title: true, accessionNo: true } },
        user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
      },
      orderBy: { requestDate: 'asc' },
    });
    for (const request of stagedRequests) assertLinkedBorrowRecord(request);
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
          bookTitles: stagedRequests.map((request) => request.book?.title || 'Deleted book'),
          status: 'Awaiting borrower verification',
          ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
        },
      },
    });

    const approvalQr = await this.generateBorrowApprovalQr(transactionId, librarianId);
    return {
      transactionId,
      requestId: approvalQr.requestId,
      qrCode: approvalQr.qrCode,
      requests: stagedRequests,
    };
  }

  private async generateBorrowApprovalQr(transactionId: string, librarianId: string) {
    const requests = await prisma.borrowRequest.findMany({
      where: { transactionId, status: 'PENDING' },
      select: { id: true },
      orderBy: { requestDate: 'asc' },
    });
    if (!requests.length) throw new BadRequestError('This transaction is no longer pending');

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + BORROW_APPROVAL_TOKEN_TTL_MS);
    const updated = await prisma.borrowRequest.updateMany({
      where: { transactionId, status: 'PENDING' },
      data: {
        approvalTokenHash: tokenHash,
        approvalTokenExpiresAt: expiresAt,
        approvalTokenUsedAt: null,
        approvalTokenIssuedById: librarianId,
      },
    });
    if (updated.count !== requests.length) {
      throw new BadRequestError('This transaction has already been processed');
    }

    return {
      requestId: requests[0].id,
      qrCode: await generateQRFromText(
        buildBorrowVerificationUrl(transactionId, requests[0].id, token),
      ),
    };
  }

  async verifyBorrowRequest(
    borrowId: string,
    userId: string,
    auditContext?: ActivityRequestContext,
    qrApproval?: { tokenHash: string },
  ) {
    const transactionId = normalizeBorrowId(borrowId);
    const requests = await prisma.borrowRequest.findMany({
      where: { transactionId, status: 'PENDING' },
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

    for (const request of requests) assertLinkedBorrowRecord(request);
    const user = requests[0].user;
    if (!user) throw new BadRequestError('The archived user cannot verify this request');
    if (requests.some((request) => !request.book || !request.bookId)) {
      throw new BadRequestError('This archived request no longer has a linked book');
    }
    const borrowDate = new Date();
    const dueDate = await this.calculateBorrowDueDate(user, borrowDate);
    const maxBooks = user.role === Role.STUDENT
      ? user.maxBooksAllowed ?? await policyService.getNumber('MAX_BOOKS_PER_USER', 3)
      : user.role === Role.FACULTY
        ? user.maxBooksAllowed ?? await policyService.getNumber('FACULTY_MAX_BOOKS', 10)
        : 999;
    const bookIds = requests.flatMap((request) => request.bookId ? [request.bookId] : []);

    const transactions = await prisma.$transaction(async (tx) => {
      if (qrApproval) {
        const consumed = await tx.borrowRequest.updateMany({
          where: {
            transactionId,
            userId,
            status: 'PENDING',
            approvalTokenHash: qrApproval.tokenHash,
            approvalTokenExpiresAt: { gt: borrowDate },
            approvalTokenUsedAt: null,
          },
          data: { approvalTokenUsedAt: borrowDate },
        });
        if (consumed.count !== requests.length) {
          throw new BadRequestError('This QR approval token is invalid, expired, or already used');
        }
      }

      const claimed = await tx.borrowRequest.updateMany({
        where: { transactionId, userId, status: 'PENDING' },
        data: { status: 'APPROVED', processedAt: borrowDate },
      });
      if (claimed.count !== requests.length) {
        throw new BadRequestError('This Borrow ID has already been verified');
      }

      const books = await tx.$queryRaw<Array<{ id: string; title: string; status: string; availableCopies: number }>>`
        SELECT id, title, status, available_copies AS "availableCopies"
        FROM books
        WHERE id = ANY (${bookIds})
        FOR UPDATE
      `;
      if (books.length !== bookIds.length) throw new NotFoundError('One or more books');
      const bookMap = new Map(books.map((book) => [book.id, book]));
      for (const bookId of bookIds) {
        const book = bookMap.get(bookId);
        if (!book) {
          throw new BadRequestError('One or more requested books are no longer available');
        }
        if (!['AVAILABLE', 'BORROWED'].includes(book.status)) {
          throw new BadRequestError(`"${book.title}" is not currently available for borrowing`);
        }
        if (book.availableCopies < 1) {
          throw new BadRequestError(`No copies available for "${book?.title || 'a requested book'}"`);
        }
      }

      const activeCount = await tx.borrowTransaction.count({
        where: { userId, status: { in: ['ACTIVE', 'OVERDUE'] } },
      });
      if (activeCount + requests.length > maxBooks) {
        throw new BadRequestError(`You have reached the maximum limit of ${maxBooks} active borrows`);
      }

      const createdTransactions = await Promise.all(requests.map((request) => {
        if (!request.bookId || !request.book) {
          throw new BadRequestError('This archived request no longer has a linked book');
        }
        return tx.borrowTransaction.create({
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
        });
      }));

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
          link: '/requests',
        },
      });
      await tx.activityLog.create({
        data: {
          userId,
          action: 'BORROW',
          entity: 'BorrowRequest',
          entityId: transactionId,
          ipAddress: auditContext?.ipAddress,
          details: {
            transactionId,
            borrowerName: `${user.firstName} ${user.lastName}`,
            bookTitles: requests.map((request) => request.book?.title || 'Deleted book'),
            dueDate,
            status: 'Verified',
            ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
          },
        },
      });
      return createdTransactions;
    }, { timeout: 20000, maxWait: 20000 });

    await sendPushToUser(userId, {
      title: 'Borrow Transaction Approved',
      body: `Your request for ${requests.length} book(s) is approved. Due date: ${dueDate.toLocaleDateString()}.`,
      url: '/requests',
      tag: `request-approved-${transactionId}`,
    });

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

    const batchId = request.requestBatchId || request.transactionId;
    if (batchId) {
      const batchWhere = request.requestBatchId
        ? { requestBatchId: request.requestBatchId, userId: request.userId }
        : { transactionId: request.transactionId, userId: request.userId };
      const bookTitles = await prisma.$transaction(async (tx) => {
        const requests = await tx.borrowRequest.findMany({
          where: batchWhere,
          include: { book: { select: { title: true } } },
        });
        if (!requests.length || requests.some((entry) => !['PENDING', 'CANCELLED'].includes(entry.status))) {
          throw new BadRequestError('This transaction has already been processed');
        }
        const pendingRequests = requests.filter((entry) => entry.status === 'PENDING');
        if (!pendingRequests.length) {
          throw new BadRequestError('This transaction has already been processed');
        }

        const updated = await tx.borrowRequest.updateMany({
          where: { ...batchWhere, status: 'PENDING' },
          data: { status: 'REJECTED', processedById: librarianId, processedAt: new Date(), notes: reason },
        });
        if (updated.count !== pendingRequests.length) {
          throw new BadRequestError('This transaction has already been processed');
        }

        const titles = pendingRequests.map((entry) => entry.book?.title || 'Deleted book').join(', ');
        await tx.notification.create({
          data: {
            userId: request.userId,
            type: 'REQUEST_REJECTED',
            title: 'Borrow Transaction Rejected',
            message: `Your request for ${titles} was rejected. Reason: ${reason}`,
            link: '/requests',
          },
        });
        await tx.activityLog.create({
          data: {
            userId: librarianId,
            action: 'REJECT_REQUEST',
            entity: 'BorrowRequest',
            entityId: batchId,
            ipAddress: auditContext?.ipAddress,
            details: {
              ...(request.requestBatchId
                ? { requestBatchId: request.requestBatchId }
                : { transactionId: request.transactionId }),
              bookTitles: titles,
              reason,
              status: 'Rejected',
              ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
            },
          },
        });
        return titles;
      });
      if (request.userId) {
        await sendPushToUser(request.userId, {
          title: 'Borrow Transaction Rejected',
          body: `Your request for ${bookTitles} was rejected. Reason: ${reason}`,
          url: '/requests',
          tag: `request-rejected-${batchId}`,
        });
      }
      return;
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestError('Request already processed');
    }
    if (!request.book || !request.bookId) {
      throw new BadRequestError('This archived request no longer has a linked book');
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
          message: `Your request to borrow "${request.book?.title || 'a book'}" was rejected. Reason: ${reason}`,
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
            bookTitle: request.book?.title || 'Deleted book',
            reason,
            status: 'Rejected',
            ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
          },
        },
      }),
    ]);
    if (request.userId) {
      await sendPushToUser(request.userId, {
        title: 'Borrow Request Rejected',
        body: `Your request to borrow "${request.book.title}" was rejected. Reason: ${reason}`,
        url: '/requests',
        tag: `request-rejected-${request.id}`,
      });
    }
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
        title: request.book?.title || 'Deleted book',
        author: request.book?.author || 'Unknown',
        accessionNo: request.book?.accessionNo || '—',
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
    if (userId) {
      const statusOrder: Record<string, number> = {
        PENDING: 0,
        APPROVED: 1,
        REJECTED: 2,
        CANCELLED: 3,
      };
      const direction = order === 'asc' ? 1 : -1;
      const requests = matchingRows.map((request) => ({
        id: request.id,
        user: request.user,
        status: request.status,
        requestDate: request.requestDate,
        notes: request.notes,
        books: [{
          ...(request.book || {}),
          requestId: request.id,
          status: request.status,
        }],
      }));

      requests.sort((a, b) => {
        if (sort === 'status') {
          const statusDifference = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
          if (statusDifference) return statusDifference * direction;
        }
        if (sort === 'memberName') {
          const aName = a.user ? `${a.user.firstName} ${a.user.lastName}` : 'Deleted user';
          const bName = b.user ? `${b.user.firstName} ${b.user.lastName}` : 'Deleted user';
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

    const transactionIds = Array.from(new Set(matchingRows
      .map((request) => request.transactionId)
      .filter((id): id is string => Boolean(id))));
    const requestBatchIds = Array.from(new Set(matchingRows
      .map((request) => request.requestBatchId)
      .filter((id): id is string => Boolean(id))));
    const siblingConditions: Prisma.BorrowRequestWhereInput[] = [];
    if (transactionIds.length) siblingConditions.push({ transactionId: { in: transactionIds } });
    if (requestBatchIds.length) siblingConditions.push({ requestBatchId: { in: requestBatchIds } });
    const siblingRows = siblingConditions.length
      ? await prisma.borrowRequest.findMany({
        where: { OR: siblingConditions, ...(userId ? { userId } : {}) },
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
      CANCELLED: 3,
    };
    const direction = order === 'asc' ? 1 : -1;
    const requests = Array.from(grouped.values()).map((group) => {
      group.sort((a, b) => a.requestDate.getTime() - b.requestDate.getTime());
      const first = group[0];
      const status = group.some((request) => request.status === 'PENDING')
        ? 'PENDING'
        : group.some((request) => request.status === 'APPROVED')
          ? 'APPROVED'
          : group.some((request) => request.status === 'REJECTED')
            ? 'REJECTED'
            : first.status;
      return {
        id: first.id,
        ...(!userId ? { requestBatchId: first.requestBatchId, transactionId: first.transactionId } : {}),
        user: first.user,
        status,
        requestDate: first.requestDate,
        notes: first.notes,
        books: group.map((request) => ({ ...request.book, requestId: request.id, status: request.status })),
      };
    });
    const filteredRequests = where.status
      ? requests.filter((request) => request.status === where.status)
      : requests;

    filteredRequests.sort((a, b) => {
      if (sort === 'status') {
        const statusDifference = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
        if (statusDifference) return statusDifference * direction;
      }
      if (sort === 'memberName') {
        const aName = a.user ? `${a.user.firstName} ${a.user.lastName}` : 'Deleted user';
        const bName = b.user ? `${b.user.firstName} ${b.user.lastName}` : 'Deleted user';
        const nameDifference = aName.localeCompare(bName);
        if (nameDifference) return nameDifference * direction;
      }
      return (a.requestDate.getTime() - b.requestDate.getTime()) * direction || a.id.localeCompare(b.id);
    });

    const total = filteredRequests.length;
    return {
      requests: filteredRequests.slice(pagination.skip, pagination.skip + pagination.take),
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
    if (!transaction.book || !transaction.user || !transaction.bookId || !transaction.userId) {
      throw new BadRequestError('This transaction no longer has an active user and book link');
    }

    const book = transaction.book;
    const borrower = transaction.user;
    const bookId = transaction.bookId;
    const borrowerId = transaction.userId;
    const now = new Date();
    const isOverdue = now >= new Date(transaction.dueDate.getFullYear(), transaction.dueDate.getMonth(), transaction.dueDate.getDate() + 1);

    // Calculate fine
    let fineAmount = 0;
    if (isOverdue) {
      const dueStart = new Date(transaction.dueDate.getFullYear(), transaction.dueDate.getMonth(), transaction.dueDate.getDate());
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.floor((todayStart.getTime() - dueStart.getTime()) / (1000 * 60 * 60 * 24));
      fineAmount = diffDays * FINE_PER_BOOK_PER_DAY;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.borrowTransaction.updateMany({
        where: {
          id: transaction.id,
          status: { in: ['ACTIVE', 'OVERDUE'] },
          returnDate: null,
        },
        data: {
          returnDate: now,
          status: 'RETURNED',
          fineAmount,
          finePaid: transaction.finePaid || fineAmount > 0,
          qrScanned: true,
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestError('This transaction has already been returned or is no longer active');
      }

      const [returnedTransaction] = await Promise.all([
        tx.borrowTransaction.findUniqueOrThrow({
          where: { id: transaction.id },
          include: {
            book: { select: { title: true, accessionNo: true, isbn: true } },
            user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
          },
        }),
        tx.book.updateMany({
          where: { id: bookId, status: { not: 'LOST' } },
          data: { availableCopies: { increment: 1 }, status: 'AVAILABLE' },
        }),
      ]);
      if (!returnedTransaction.book) {
        throw new BadRequestError('The book was removed before the transaction could be updated');
      }
      await tx.activityLog.create({
        data: {
          userId: actorUserId || transaction.userId,
          action: 'RETURN_BOOK',
          entity: 'BorrowTransaction',
          entityId: transaction.id,
          ipAddress: auditContext?.ipAddress,
          details: {
            bookTitle: book.title,
            accessionNo: book.accessionNo,
            isOverdue,
            fineAmount,
            status: 'Returned',
            ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
          },
        },
      });
      return returnedTransaction;
    });
    if (!updated.book) throw new BadRequestError('The book was removed before the transaction could be updated');

    await prisma.$transaction(async (tx) => {
      await this.lockReservationBooks([bookId], tx);
      await this.recalculateReservationQueueForBook(bookId, tx);
    });

    // Notify all librarians about the returned book
    const borrowerName = `${borrower.firstName} ${borrower.lastName}`;
    await notificationService.notifyAllLibrarians(
      'BORROW_CONFIRMATION',
      'Book Returned',
      `${borrowerName} returned "${book.title}"${isOverdue ? ' (overdue)' : ''}`,
      '/requests'
    );

    if (fineAmount > 0) {
      const fineMessage = `Your overdue fine of ₱${fineAmount.toFixed(2)} for "${book.title}" was automatically marked as paid when the book was returned.`;
      await prisma.notification.create({
        data: {
          userId: borrowerId,
          type: 'OVERDUE_FINE',
          title: 'Overdue Fine Paid',
          message: fineMessage,
          link: `/requests?transactionId=${encodeURIComponent(transaction.id)}`,
        },
      });
      if (borrowerId) {
        await sendPushToUser(borrowerId, {
          title: 'Overdue Fine Paid',
          body: fineMessage,
          url: `/requests?transactionId=${encodeURIComponent(transaction.id)}`,
          tag: `fine-paid-${transaction.id}`,
        });
      }
    }

    const nextReservation = await prisma.reservation.findFirst({
      where: { bookId, status: 'ACTIVE' },
      orderBy: [{ user: { role: 'asc' } }, { reservationDate: 'asc' }, { queuePosition: 'asc' }],
      include: { user: { select: { firstName: true, lastName: true, role: true } } },
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
    await this.synchronizeOverdueTransactions();
    const transaction = await prisma.borrowTransaction.findUnique({
      where: { id: transactionId },
      include: {
        book: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!transaction) throw new NotFoundError('Transaction');
    if (!['ACTIVE', 'OVERDUE'].includes(transaction.status) || transaction.returnDate) {
      throw new BadRequestError('Only active or overdue borrows can be declared missing');
    }
    if (!transaction.book || !transaction.user || !transaction.bookId || !transaction.userId) {
      throw new BadRequestError('This transaction no longer has an active user and book link');
    }

    const book = transaction.book;
    const borrower = transaction.user;
    const bookId = transaction.bookId;
    const borrowerId = transaction.userId;
    const now = new Date();
    const replacementValue = Number(book.replacementValue ?? 0);
    const missingFineAmount = Number.isFinite(replacementValue) ? Math.max(0, replacementValue) : 0;
    const outstandingOverdueFine = transaction.finePaid ? 0 : Math.max(0, Number(transaction.fineAmount ?? 0));
    const fineAmount = Number((outstandingOverdueFine + missingFineAmount).toFixed(2));

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.borrowTransaction.updateMany({
        where: {
          id: transaction.id,
          status: { in: ['ACTIVE', 'OVERDUE'] },
          returnDate: null,
        },
        data: {
          returnDate: now,
          status: 'MISSING',
          fineAmount,
          finePaid: false,
          qrScanned: true,
          notes: reason ? `${transaction.notes ? transaction.notes + ' ' : ''}Declared missing: ${reason}`.trim() : (transaction.notes || undefined),
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestError('Only active or overdue borrows can be declared missing');
      }
      const missingTransaction = await tx.borrowTransaction.findUniqueOrThrow({
        where: { id: transaction.id },
        include: {
          book: { select: { title: true, accessionNo: true, isbn: true } },
          user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
        },
      });
      await tx.book.update({
        where: { id: bookId },
        data: { availableCopies: 0, status: 'LOST' },
      });
      await tx.activityLog.create({
        data: {
          userId: librarianId,
          action: 'DECLARE_MISSING',
          entity: 'BorrowTransaction',
          entityId: transaction.id,
          details: {
            bookTitle: book.title,
            accessionNo: book.accessionNo,
            borrower: `${borrower.firstName} ${borrower.lastName}`,
            reason: reason || null,
            replacementValue: missingFineAmount,
            outstandingOverdueFine,
            totalFineAmount: fineAmount,
          },
        },
      });
      await tx.notification.create({
        data: {
          userId: borrowerId,
          type: 'SYSTEM',
          isSystem: true,
          title: 'Book Declared Missing',
          message: `The book "${book.title}" you borrowed has been declared missing. An unpaid fine of ₱${fineAmount.toFixed(2)} has been added to your account.`,
          link: '/requests',
        },
      });
      return missingTransaction;
    });
    if (!updated.book) throw new BadRequestError('The book was removed before the transaction could be updated');

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
    return prisma.$executeRaw`
      UPDATE borrow_transactions
      SET status = 'OVERDUE',
          fine_amount = GREATEST(0, (${todayStart}::date - due_date::date)) * ${FINE_PER_BOOK_PER_DAY}
      WHERE status IN ('ACTIVE', 'OVERDUE')
        AND due_date < ${todayStart}
        AND return_date IS NULL
    `;
  }

  /**
   * Pay fine for an overdue/returned transaction
   */
  async payFine(
    transactionId: string,
    amount: number,
    actorUserId: string,
    actorRole: string,
    auditContext?: ActivityRequestContext,
  ) {
    const transaction = await prisma.borrowTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!transaction) throw new NotFoundError('Transaction');
    if (transaction.userId !== actorUserId && actorRole !== 'LIBRARIAN') {
      throw new ForbiddenError('You can only pay fines for your own transactions');
    }
    if (transaction.finePaid) throw new BadRequestError('Fine already paid');
    if (!transaction.fineAmount || transaction.fineAmount <= 0) {
      throw new BadRequestError('No fine to pay');
    }

    if (amount < transaction.fineAmount) {
      throw new BadRequestError(
        `Insufficient payment. Required: ₱${transaction.fineAmount.toFixed(2)}, provided: ₱${amount.toFixed(2)}`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.borrowTransaction.updateMany({
        where: { id: transactionId, finePaid: false },
        data: { finePaid: true },
      });
      if (claimed.count !== 1) throw new BadRequestError('Fine already paid');
      const paidTransaction = await tx.borrowTransaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: {
          book: { select: { title: true, accessionNo: true } },
          user: { select: { firstName: true, lastName: true, libraryId: true } },
        },
      });
      await recordActivity({
        userId: actorUserId,
        action: 'PAY_FINE',
        description: `Paid fine for "${paidTransaction.book?.title || 'Deleted book'}"`,
        entity: 'BorrowTransaction',
        entityId: transactionId,
        ipAddress: auditContext?.ipAddress,
        details: {
          bookTitle: paidTransaction.book?.title || 'Deleted book',
          borrowerName: paidTransaction.user ? `${paidTransaction.user.firstName} ${paidTransaction.user.lastName}` : 'Unknown member',
          fineAmount: transaction.fineAmount,
          status: 'Paid',
          ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
        },
      }, tx);
      return paidTransaction;
    });

    if (transaction.userId) {
      await prisma.notification.create({
        data: {
          userId: transaction.userId,
          type: 'SYSTEM',
          isSystem: true,
          title: 'Fine Paid',
          message: `Your fine of ₱${transaction.fineAmount.toFixed(2)} for "${updated.book?.title || 'a deleted book'}" has been paid.`,
          link: `/transactions/${transactionId}`,
        },
      });
    }

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
      requestId: receipt.requestId,
      transactionId: receipt.transactionId,
      approvalCode: formatBorrowId(receipt.transactionId),
      bookTitle: firstRequest.book?.title || 'Deleted book',
      accessionNo: firstRequest.book?.accessionNo || '—',
      memberName: firstRequest.user ? `${firstRequest.user.firstName} ${firstRequest.user.lastName}` : 'Deleted user',
      libraryId: firstRequest.user?.libraryId || '—',
      qrCode: receipt.qrCode,
    };
  }

  /** Confirm the Borrow ID for the authenticated borrower and activate the batch. */
  async approveByQRCode(requestId: string, token: string | undefined, approvalCode: string | undefined, userId: string) {
    const request = await prisma.borrowRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        userId: true,
        status: true,
        transactionId: true,
        approvalTokenExpiresAt: true,
        approvalTokenUsedAt: true,
      },
    });
    if (!request) throw new NotFoundError('Borrow request');
    if (request.userId !== userId) throw new NotFoundError('Pending Borrow ID');
    if (!token || !approvalCode || request.status !== 'PENDING' || !request.transactionId) {
      throw new BadRequestError('This request is not pending or has no Borrow ID');
    }
    if (normalizeBorrowId(approvalCode) !== request.transactionId) {
      throw new BadRequestError('Invalid Borrow ID');
    }
    if (request.approvalTokenUsedAt) {
      throw new BadRequestError('This QR approval token has already been used');
    }
    if (!request.approvalTokenExpiresAt || request.approvalTokenExpiresAt <= new Date()) {
      throw new BadRequestError('This QR approval token has expired');
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return this.verifyBorrowRequest(approvalCode, userId, undefined, { tokenHash });
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
  async reserveBook(
    userId: string,
    bookId: string,
    auditContext?: ActivityRequestContext,
    idempotencyKey?: string
  ) {
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({ bookId })).digest('hex');
    const reservationInclude = {
      book: { select: { title: true, author: true, accessionNo: true, isbn: true } },
      user: { select: { firstName: true, lastName: true, libraryId: true, role: true } },
    } as const;

    const result = await prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await this.acquireIdempotencyRecord(
          tx,
          userId,
          idempotencyKey,
          'CREATE_RESERVATION',
          requestHash
        );
        if (existing) {
          const reservation = await tx.reservation.findUnique({
            where: { id: existing.resourceId },
            include: reservationInclude,
          });
          if (!reservation) throw new NotFoundError('Previously created reservation');
          return { reservation, bookTitle: reservation.book?.title ?? '', replayed: true };
        }
      }

      await this.lockReservationBooks([bookId], tx);
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, role: true },
      });
      if (!user) throw new NotFoundError('User');
      if (!['STUDENT', 'FACULTY'].includes(user.role)) {
        throw new BadRequestError('Only students and faculty can reserve books.');
      }

      const book = await tx.book.findUnique({ where: { id: bookId } });
      if (!book) throw new NotFoundError('Book');
      if (book.status === 'LOST') {
        throw new BadRequestError('This book is missing and cannot be reserved.');
      }
      if (!['AVAILABLE', 'BORROWED'].includes(book.status)) {
        throw new BadRequestError('This book is unavailable and cannot be reserved.');
      }
      if (book.availableCopies !== 0) {
        throw new BadRequestError(book.availableCopies > 0
          ? 'This book is currently available. Please borrow it instead.'
          : 'This book is unavailable and cannot be reserved.');
      }
      await this.recalculateReservationQueueForBook(bookId, tx);

      const existingReservation = await tx.reservation.findFirst({
        where: { userId, bookId, status: { in: ['ACTIVE', 'APPROVED'] } },
      });
      if (existingReservation) {
        throw new ConflictError('You already have an active reservation for this book');
      }

      const activeBorrow = await tx.borrowTransaction.findFirst({
        where: { userId, bookId, status: 'ACTIVE' },
      });
      if (activeBorrow) throw new ConflictError('You already have this book borrowed');

      const queueLimit = await policyService.getNumber('RESERVATION_QUEUE_LIMIT', 10);
      const activeReservations = await tx.reservation.count({
        where: { bookId, status: 'ACTIVE' },
      });
      if (activeReservations >= queueLimit) {
        throw new BadRequestError(`Reservation queue is full (max ${queueLimit}) for this book`);
      }

      const maxExpiryDays = await policyService.getNumber('MAX_RESERVATION_DAYS', 3);
      const queuePosition = activeReservations + 1;
      const created = await tx.reservation.create({
        data: {
          userId,
          bookId,
          status: 'ACTIVE',
          expiryDate: new Date(Date.now() + maxExpiryDays * 24 * 60 * 60 * 1000),
          queuePosition,
          notified: false,
        },
        include: reservationInclude,
      });
      await this.recalculateReservationQueueForBook(bookId, tx);
      const reservation = await tx.reservation.findUnique({
        where: { id: created.id },
        include: reservationInclude,
      });
      if (!reservation) throw new NotFoundError('Created reservation');

      if (idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            userId,
            key: idempotencyKey,
            operation: 'CREATE_RESERVATION',
            requestHash,
            resourceId: reservation.id,
          },
        });
      }

      return { reservation, bookTitle: book.title, replayed: false };
    }, {
      timeout: 20000,
      maxWait: 20000,
    });

    if (!result.replayed) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          isSystem: true,
          title: 'Reservation placed',
          message: `Your reservation for "${result.bookTitle}" is queued at position ${result.reservation.queuePosition ?? 1}.`,
          link: `/reservations/${result.reservation.id}`,
        },
      });

      await prisma.activityLog.create({
        data: {
          userId,
          action: 'RESERVE_BOOK',
          entity: 'Reservation',
          entityId: result.reservation.id,
          ipAddress: auditContext?.ipAddress,
          details: {
            bookTitle: result.bookTitle,
            queuePosition: result.reservation.queuePosition,
            status: 'Reserved',
            ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
          },
        },
      });
    }

    return result.reservation;
  }

  async approveReservation(reservationId: string, librarianId: string, auditContext?: ActivityRequestContext) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        book: { select: { title: true, availableCopies: true } },
        user: { select: { firstName: true, lastName: true, role: true } },
      },
    });
    if (!reservation) throw new NotFoundError('Reservation');
    if (!reservation.book || !reservation.bookId || !reservation.userId) {
      throw new BadRequestError('This archived reservation can no longer be approved');
    }
    if (reservation.status !== 'ACTIVE') throw new BadRequestError('Reservation is already resolved.');
    if (reservation.expiryDate <= new Date()) {
      await prisma.$transaction(async (tx) => {
        await this.lockReservationBooks([reservation.bookId!], tx);
        await this.recalculateReservationQueueForBook(reservation.bookId!, tx);
      });
      throw new BadRequestError('This reservation has expired and can no longer be approved.');
    }
    if (reservation.book.availableCopies < 1) {
      throw new BadRequestError('This reserved book is not available for pickup yet.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await this.lockReservationBooks([reservation.bookId!], tx);
      const result = await tx.reservation.updateMany({
        where: { id: reservationId, status: 'ACTIVE', expiryDate: { gt: new Date() } },
        data: { status: 'APPROVED', notified: true },
      });
      if (result.count !== 1) throw new ConflictError('Reservation expired or changed before it could be approved. Refresh and try again.');
      const approved = await tx.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        include: {
          book: { select: { title: true, author: true, accessionNo: true, isbn: true } },
          user: { select: { firstName: true, lastName: true, libraryId: true, role: true } },
        },
      });
      await this.recalculateReservationQueueForBook(reservation.bookId!, tx);
      return approved;
    });

    await prisma.notification.create({
      data: {
        userId: reservation.userId,
        type: 'SYSTEM',
        isSystem: true,
        title: 'Reservation approved',
        message: `Your reservation for "${reservation.book.title}" has been approved and is ready for pickup.`,
        link: `/reservations/${reservation.id}`,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: librarianId,
        action: 'APPROVE_RESERVATION',
        entity: 'Reservation',
        entityId: reservationId,
        ipAddress: auditContext?.ipAddress,
        details: {
          bookTitle: reservation.book.title,
          status: 'Approved',
          ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
        },
      },
    });

    return updated;
  }

  async rejectReservation(reservationId: string, librarianId: string, reason = 'No reason provided', auditContext?: ActivityRequestContext) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { book: { select: { title: true } }, user: { select: { firstName: true, lastName: true } } },
    });
    if (!reservation) throw new NotFoundError('Reservation');
    if (!reservation.book || !reservation.bookId || !reservation.userId) {
      throw new BadRequestError('This archived reservation can no longer be rejected');
    }
    const bookId = reservation.bookId;
    if (reservation.status !== 'ACTIVE') throw new BadRequestError('Reservation already processed');

    const updated = await prisma.$transaction(async (tx) => {
      await this.lockReservationBooks([bookId], tx);
      const cancelled = await tx.reservation.updateMany({
        where: { id: reservationId, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });
      if (cancelled.count !== 1) throw new ConflictError('Reservation changed before it could be rejected. Refresh and try again.');
      await this.recalculateReservationQueueForBook(bookId, tx);
      return tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    });

    await prisma.notification.create({
      data: {
        userId: reservation.userId,
        type: 'RESERVATION_CANCELLED',
        title: 'Reservation rejected',
        message: `Your reservation for "${reservation.book.title}" was rejected. Reason: ${reason}`,
        link: '/reservations',
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: librarianId,
        action: 'REJECT_RESERVATION',
        entity: 'Reservation',
        entityId: reservationId,
        ipAddress: auditContext?.ipAddress,
        details: {
          bookTitle: reservation.book.title,
          reason,
          status: 'Rejected',
          ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
        },
      },
    });

    return updated;
  }

  async pickupReservation(reservationId: string, userId: string, auditContext?: ActivityRequestContext) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        book: { select: { id: true, title: true, availableCopies: true, status: true } },
        user: { select: { id: true, firstName: true, lastName: true, role: true, maxBorrowDays: true, maxBooksAllowed: true } },
      },
    });
    if (!reservation) throw new NotFoundError('Reservation');
    if (!reservation.book || !reservation.user || !reservation.bookId || !reservation.userId) {
      throw new BadRequestError('This archived reservation can no longer be picked up');
    }
    const bookId = reservation.bookId;
    if (reservation.userId !== userId) throw new BadRequestError('This reservation is not assigned to you.');
    if (!['ACTIVE', 'APPROVED'].includes(reservation.status)) {
      throw new BadRequestError('This reservation has already been fulfilled or cancelled.');
    }
    if (reservation.expiryDate <= new Date()) {
      await prisma.$transaction(async (tx) => {
        await this.lockReservationBooks([bookId], tx);
        await this.recalculateReservationQueueForBook(bookId, tx);
      });
      throw new BadRequestError('This reservation has expired and can no longer be picked up.');
    }

    const book = await prisma.book.findUnique({ where: { id: reservation.bookId } });
    if (!book) throw new NotFoundError('Book');
    if ((book.availableCopies ?? 0) < 1) {
      throw new BadRequestError('This reserved book is not available for pickup yet.');
    }

    const loanDate = new Date();
    const dueDate = await this.calculateBorrowDueDate(
      { role: reservation.user.role, maxBorrowDays: reservation.user.maxBorrowDays ?? null },
      loanDate
    );

    const transaction = await prisma.$transaction(async (tx) => {
      await this.lockReservationBooks([bookId], tx);
      const claimedReservation = await tx.reservation.updateMany({
        where: {
          id: reservation.id,
          userId,
          status: { in: ['ACTIVE', 'APPROVED'] },
          expiryDate: { gt: new Date() },
        },
        data: {
          status: 'FULFILLED',
          notified: true,
        },
      });
      if (claimedReservation.count !== 1) {
        throw new ConflictError('This reservation expired, was cancelled, or was picked up by another action. Refresh your reservations.');
      }

      const transactionId = await this.generateUniqueTransactionId(tx);
      const created = await tx.borrowTransaction.create({
        data: {
          userId,
          bookId,
          transactionId,
          borrowDate: loanDate,
          dueDate,
          status: 'ACTIVE',
          notes: 'Checked out as a reservation pickup',
        },
        include: {
          book: { select: { title: true, accessionNo: true, isbn: true } },
          user: { select: { firstName: true, lastName: true, libraryId: true, role: true } },
        },
      });

      const decremented = await tx.book.updateMany({
        where: { id: bookId, availableCopies: { gt: 0 }, status: { not: 'LOST' } },
        data: { availableCopies: { decrement: 1 } },
      });
      if (decremented.count !== 1) throw new BadRequestError('This reserved book is no longer available for pickup.');
      const updatedBook = await tx.book.findUniqueOrThrow({
        where: { id: bookId },
        select: { availableCopies: true },
      });
      await tx.book.update({
        where: { id: bookId },
        data: { status: updatedBook.availableCopies < 1 ? 'BORROWED' : 'AVAILABLE' },
      });

      await this.recalculateReservationQueueForBook(bookId, tx);
      return created;
    });

    await prisma.notification.create({
      data: {
        userId,
        type: 'REQUEST_APPROVED',
        title: 'Reservation ready for pickup',
        message: `Your reserved book "${reservation.book.title}" is ready. Please collect it before ${dueDate.toLocaleDateString()}.`,
        link: `/transactions/${transaction.id}`,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId,
        action: 'PICKUP_RESERVATION',
        entity: 'Reservation',
        entityId: reservationId,
        ipAddress: auditContext?.ipAddress,
        details: {
          bookTitle: reservation.book.title,
          status: 'Picked up',
          dueDate,
          ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
        },
      },
    });

    return transaction;
  }

  /**
   * Cancel a reservation
   * - Recalculates queue positions
   */
  async cancelReservations(reservationIds: string[], userId: string, auditContext?: ActivityRequestContext) {
    const ids = Array.from(new Set(reservationIds));
    if (!ids.length || ids.length > 50 || ids.length !== reservationIds.length) {
      throw new BadRequestError('Select between 1 and 50 unique reservations to cancel');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const reservations = await tx.reservation.findMany({
          where: { id: { in: ids }, userId },
          include: { book: { select: { title: true } } },
        });
        if (reservations.length !== ids.length) {
          throw new BadRequestError('One or more selected reservations do not belong to you or no longer exist');
        }
        if (reservations.some((reservation) =>
          !reservation.bookId ||
          !reservation.book ||
          !['ACTIVE', 'APPROVED'].includes(reservation.status)
        )) {
          throw new BadRequestError('Only active or approved reservations that have not been picked up can be cancelled');
        }

        const bookIds = Array.from(new Set(reservations.map((reservation) => reservation.bookId!)));
        await this.lockReservationBooks(bookIds, tx);
        const lockedBooks = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM books
          WHERE id = ANY(${bookIds})
          ORDER BY id
          FOR UPDATE
        `;
        if (lockedBooks.length !== bookIds.length) {
          throw new BadRequestError('One or more selected books no longer exist');
        }
        const checkedOut = await tx.borrowTransaction.findFirst({
          where: {
            userId,
            bookId: { in: bookIds },
            status: { in: ['ACTIVE', 'OVERDUE', 'MISSING'] },
            returnDate: null,
          },
          select: { id: true },
        });
        if (checkedOut) {
          throw new BadRequestError('A reservation for a book currently in your possession cannot be cancelled');
        }

        const updated = await tx.reservation.updateMany({
          where: {
            id: { in: ids },
            userId,
            status: { in: ['ACTIVE', 'APPROVED'] },
          },
          data: { status: 'CANCELLED' },
        });
        if (updated.count !== ids.length) {
          throw new ConflictError('One or more reservations changed while being cancelled. Refresh and try again.');
        }

        for (const bookId of bookIds) {
          await this.recalculateReservationQueueForBook(bookId, tx);
        }
        await tx.activityLog.createMany({
          data: reservations.map((reservation) => ({
            userId,
            action: 'CANCEL_RESERVATION',
            entity: 'Reservation',
            entityId: reservation.id,
            ipAddress: auditContext?.ipAddress,
            details: {
              bookTitle: reservation.book!.title,
              status: 'Cancelled',
              ...(auditContext?.userAgent ? { userAgent: auditContext.userAgent } : {}),
            },
          })),
        });

        return {
          cancelled: reservations.map((reservation) => ({
            id: reservation.id,
            title: reservation.book!.title,
          })),
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictError('Your selected reservations changed while being cancelled. Refresh the list and try again.');
      }
      throw error;
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

    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: { in: ['ACTIVE', 'APPROVED'] },
        expiryDate: { lte: new Date() },
      },
      select: { id: true, bookId: true },
    });
    if (expiredReservations.length) {
      await prisma.$transaction(async (tx) => {
        const expiredBookIds = Array.from(new Set(expiredReservations.flatMap(({ bookId }) => bookId ? [bookId] : [])));
        await this.lockReservationBooks(expiredBookIds, tx);
        await tx.reservation.updateMany({
          where: {
            id: { in: expiredReservations.map(({ id }) => id) },
            status: { in: ['ACTIVE', 'APPROVED'] },
            expiryDate: { lte: new Date() },
          },
          data: { status: 'EXPIRED' },
        });
        for (const bookId of expiredBookIds) {
          await this.recalculateReservationQueueForBook(bookId, tx);
        }
      });
    }

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, libraryId: true, role: true } },
          book: { select: { id: true, title: true, author: true, accessionNo: true, isbn: true, availableCopies: true, status: true } },
        },
        orderBy: [{ user: { role: 'asc' } }, { reservationDate: 'asc' }, { queuePosition: 'asc' }],
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
      if (!txn.book || !txn.userId) continue;
      const dueStart = new Date(txn.dueDate.getFullYear(), txn.dueDate.getMonth(), txn.dueDate.getDate());
      const diffDays = Math.floor((todayStart.getTime() - dueStart.getTime()) / (1000 * 60 * 60 * 24));
      const fine = Math.max(0, diffDays) * FINE_PER_BOOK_PER_DAY;

      const overdueMessage = `"${txn.book.title}" is ${diffDays} day(s) overdue. Fine: ₱${fine.toFixed(2)}. Please return immediately.`;
      await prisma.notification.create({
        data: {
          userId: txn.userId,
          type: 'OVERDUE_FINE',
          title: 'Book Overdue',
          message: overdueMessage,
          link: `/requests?transactionId=${encodeURIComponent(txn.id)}`,
        },
      });
      await sendPushToUser(txn.userId, {
        title: 'Book Overdue',
        body: overdueMessage,
        url: `/requests?transactionId=${encodeURIComponent(txn.id)}`,
        tag: `overdue-${txn.id}`,
      });
    }

    return { processed: overdueTransactions.length };
  }
}

export const transactionService = new TransactionService();
