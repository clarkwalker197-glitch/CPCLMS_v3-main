// ============================================================
// Reservation Routes
// ============================================================

import { Router } from 'express';
import { transactionController } from '../controllers';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { cancelSelectedSchema, confirmCancellationSchema, reserveBookSchema } from '../validators/transaction.schema';

const router = Router();

// All reservation routes require authentication
router.use(authenticate);

// ── CRUD ─────────────────────────────────────────────────
router.post('/', authorize('STUDENT', 'FACULTY'), validate(reserveBookSchema), transactionController.reserveBook);
router.get('/', transactionController.listReservations);
router.put('/cancel-selected', authorize('STUDENT', 'FACULTY'), validate(cancelSelectedSchema), transactionController.cancelSelectedReservations);
router.put('/:id/approve', authorize('LIBRARIAN'), transactionController.approveReservation);
router.put('/:id/reject', authorize('LIBRARIAN'), transactionController.rejectReservation);
router.put('/:id/pickup', transactionController.pickupReservation);
router.put('/:id/cancel', validate(confirmCancellationSchema), transactionController.cancelReservation);

export default router;
