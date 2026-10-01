// ============================================================
// Borrow Transaction & Reservation Controller
// ============================================================

import { Request, Response } from 'express';
import { transactionService } from '../services';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/helpers';
import { AuthenticatedRequest } from '../types';

// ============================================================
// Borrow Requests
// ============================================================

export const createBorrowRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { bookIds, bookId, notes } = req.body;
    // Accept either a single bookId (backward compatible) or an array of bookIds
    const normalizedBookIds: string[] = Array.isArray(bookIds)
      ? bookIds
      : bookId
        ? [bookId]
        : [];
    const request = await transactionService.createBorrowRequest({
      userId: req.user!.userId,
      bookIds: normalizedBookIds,
      notes,
      auditContext: { ipAddress: req.ip, userAgent: req.get('user-agent') },
    });
    sendSuccess(res, request, 'Borrow request submitted', 201);
  }
);

export const listBorrowRequests = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId =
      req.user!.role === 'LIBRARIAN' ? undefined : req.user!.userId;
    const { requests, meta } = await transactionService.listBorrowRequests(
      req.query as Record<string, unknown>,
      userId
    );
    sendSuccess(res, requests, undefined, 200, meta);
  }
);

export const approveRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await transactionService.approveRequest(
      req.params.id,
      req.user!.userId,
      { ipAddress: req.ip, userAgent: req.get('user-agent') }
    );
    sendSuccess(res, result, 'Borrow ID is ready for borrower verification');
  }
);

export const rejectRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { reason } = req.body;
    if (!reason) {
      res.status(400).json({ success: false, error: 'Rejection reason is required' });
      return;
    }
    await transactionService.rejectRequest(req.params.id, req.user!.userId, reason, { ipAddress: req.ip, userAgent: req.get('user-agent') });
    sendSuccess(res, null, 'Borrow request rejected');
  }
);

export const getBorrowRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const request = await transactionService.getBorrowRequest(req.params.id);
    sendSuccess(res, request);
  }
);

export const getBorrowRequestBatch = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.role === 'LIBRARIAN' ? undefined : req.user!.userId;
    const transaction = await transactionService.getBorrowRequestBatch(req.params.transactionId, userId);
    sendSuccess(res, transaction);
  }
);

export const approveBorrowRequestBatch = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await transactionService.approveTransactionBatch(
      req.params.batchId,
      req.user!.userId,
      { ipAddress: req.ip, userAgent: req.get('user-agent') }
    );
    sendSuccess(res, result, 'Borrow ID is ready for borrower verification');
  }
);

export const verifyBorrowRequest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await transactionService.verifyBorrowRequest(
      req.body.borrowId,
      req.user!.userId,
      { ipAddress: req.ip, userAgent: req.get('user-agent') }
    );
    sendSuccess(res, result, 'Borrow ID verified; request approved');
  }
);

// Generate a unique QR code for a pending borrow request (librarian only).
// The QR encodes a deep link that the borrower scans to confirm approval.
export const generateRequestQR = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await transactionService.generateApprovalQR(
      req.params.id,
      req.user!.userId
    );
    sendSuccess(res, result, 'Approval QR code generated');
  }
);

// Confirm approval after the authenticated borrower scans the QR or enters the Borrow ID.
export const approveByQRCode = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { requestId, token, approvalCode } = req.body;
    if (!requestId) {
      res.status(400).json({ success: false, error: 'requestId is required' });
      return;
    }
    if (!token && !approvalCode) {
      res.status(400).json({ success: false, error: 'Either token or approvalCode is required' });
      return;
    }
    const result = await transactionService.approveByQRCode(
      requestId,
      token,
      approvalCode,
      req.user!.userId
    );
    sendSuccess(res, result, 'Borrow request approved');
  }
);

// ============================================================
// Borrow Transactions
// ============================================================

export const listTransactions = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId =
      req.user!.role === 'LIBRARIAN' ? undefined : req.user!.userId;
    const { transactions, meta } = await transactionService.listTransactions(
      req.query as Record<string, unknown>,
      userId
    );
    sendSuccess(res, transactions, undefined, 200, meta);
  }
);

export const getTransaction = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const transaction = await transactionService.getTransaction(req.params.id);
    sendSuccess(res, transaction);
  }
);

export const returnBook = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { qrCode } = req.body;
  const identifier = qrCode || req.params.id;
  const transaction = await transactionService.returnBook(identifier, req.user!.userId, { ipAddress: req.ip, userAgent: req.get('user-agent') });
  sendSuccess(res, transaction, 'Book returned successfully');
});

export const declareMissing = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { reason } = req.body;
    const transaction = await transactionService.declareMissing(
      req.params.id,
      req.user!.userId,
      reason
    );
    sendSuccess(res, transaction, 'Book declared missing');
  }
);

export const payFine = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { amount } = req.body;
    const transaction = await transactionService.payFine(req.params.id, amount);
    sendSuccess(res, transaction, 'Fine paid successfully');
  }
);

export const checkOverdue = asyncHandler(
  async (_req: Request, res: Response) => {
    const result = await transactionService.checkOverdueTransactions();
    sendSuccess(res, result, 'Overdue check completed');
  }
);

// ============================================================
// Reservations
// ============================================================

export const reserveBook = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { bookId } = req.body;
    const reservation = await transactionService.reserveBook(
      req.user!.userId,
      bookId,
      { ipAddress: req.ip, userAgent: req.get('user-agent') }
    );
    sendSuccess(res, reservation, 'Book reserved successfully', 201);
  }
);

export const cancelReservation = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    await transactionService.cancelReservation(req.params.id, req.user!.userId, { ipAddress: req.ip, userAgent: req.get('user-agent') });
    sendSuccess(res, null, 'Reservation cancelled');
  }
);

export const listReservations = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId =
      req.user!.role === 'LIBRARIAN' ? undefined : req.user!.userId;
    const { reservations, meta } = await transactionService.listReservations(
      req.query as Record<string, unknown>,
      userId
    );
    sendSuccess(res, reservations, undefined, 200, meta);
  }
);

export const getMyActiveCount = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const count = await transactionService.getUserActiveCount(req.user!.userId);
    sendSuccess(res, { activeCount: count });
  }
);
