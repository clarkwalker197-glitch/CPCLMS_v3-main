// ============================================================
// Zod Validation Schemas — Transactions & Reservations
// ============================================================

import { z } from 'zod';

/**
 * Create a borrow request
 * - Supports a single `bookId` (backward compatible) OR an array `bookIds`.
 * - Enforces a maximum of 3 books per transaction.
 */
export const createBorrowRequestSchema = z.object({
  body: z
    .object({
      bookId: z.string().min(1, 'Book ID is required').optional(),
      bookIds: z
        .array(z.string().min(1, 'Book ID is required'))
        .min(1, 'At least one book is required')
        .max(3, 'You can only borrow a maximum of 3 books per transaction.')
        .optional(),
      notes: z.string().max(500).optional(),
    })
    .refine(
      (body) => Boolean(body.bookId) || (Array.isArray(body.bookIds) && body.bookIds.length > 0),
      { message: 'Book ID is required', path: ['bookId'] }
    ),
});

/**
 * Approve a borrow request (librarian)
 */
export const approveRequestSchema = z.object({
  body: z.object({}),
});

export const approveByQRCodeSchema = z.object({
  body: z.object({
    requestId: z.string().min(1).max(100),
    token: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid QR approval token'),
    approvalCode: z.string().regex(/^(?:\d{8}|BRW-\d{4}-\d{4})$/i, 'Invalid Borrow ID format'),
  }),
});

export const verifyBorrowRequestSchema = z.object({
  body: z.object({
    borrowId: z.string().trim().regex(/^(?:\d{8}|BRW-\d{4}-\d{4})$/i, 'Enter a valid Borrow ID'),
  }),
});

/**
 * Reject a borrow request (librarian)
 */
export const rejectRequestSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Reason is required').max(500),
  }),
});

/**
 * Return a book via QR scan
 */
export const returnBookSchema = z.object({
  body: z.object({
    qrCode: z.string().optional(), /// QR code payload (optional — can return by transaction ID too)
  }),
});

/**
 * Reserve a book
 */
export const reserveBookSchema = z.object({
  body: z.object({
    bookId: z.string().min(1, 'Book ID is required'),
  }),
});

export const cancelSelectedSchema = z.object({
  body: z.object({
    ids: z.array(z.string().min(1)).min(1, 'Please select at least one item to cancel.').max(50),
    confirmed: z.literal(true),
  }).refine(({ ids }) => new Set(ids).size === ids.length, {
    message: 'Duplicate cancellation selections are not allowed.',
    path: ['ids'],
  }),
});

export const confirmCancellationSchema = z.object({
  body: z.object({ confirmed: z.literal(true) }),
});

/**
 * Pay fine
 */
export const payFineSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive('Fine amount must be positive'),
  }),
});

export const resolveMissingSchema = z.object({
  body: z.object({
    outcome: z.enum(['PAID', 'REPLACED']),
  }),
});

// Types
export type CreateBorrowRequestInput = z.infer<typeof createBorrowRequestSchema>['body'];
export type ApproveRequestInput = z.infer<typeof approveRequestSchema>['body'];
export type RejectRequestInput = z.infer<typeof rejectRequestSchema>['body'];
export type ReturnBookInput = z.infer<typeof returnBookSchema>['body'];
export type ReserveBookInput = z.infer<typeof reserveBookSchema>['body'];
