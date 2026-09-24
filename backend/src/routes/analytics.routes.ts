// ============================================================
// Analytics & Dashboard Routes
// ============================================================

import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/dashboard', authorize('LIBRARIAN'), analyticsController.getDashboardStats);
router.get('/my-dashboard', analyticsController.getMyDashboardStats);
router.get('/monthly-trends', authorize('LIBRARIAN'), analyticsController.getMonthlyTrends);
router.get('/most-borrowed-categories', authorize('LIBRARIAN'), analyticsController.getMostBorrowedCategories);
router.get('/department-distribution', authorize('LIBRARIAN'), analyticsController.getDepartmentDistribution);
router.get('/overdue-fines', authorize('LIBRARIAN'), analyticsController.getOverdueFinesSummary);
router.get('/top-borrowed-books', authorize('LIBRARIAN'), analyticsController.getTopBorrowedBooks);
router.get('/return-performance', authorize('LIBRARIAN'), analyticsController.getReturnPerformance);
router.get('/request-pipeline', authorize('LIBRARIAN'), analyticsController.getRequestPipelineStats);
router.get('/inventory-health', authorize('LIBRARIAN'), analyticsController.getInventoryHealth);
router.get('/member-engagement', authorize('LIBRARIAN'), analyticsController.getMemberEngagement);

export default router;

