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
router.get('/most-borrowed-categories', analyticsController.getMostBorrowedCategories);
router.get('/department-distribution', authorize('LIBRARIAN'), analyticsController.getDepartmentDistribution);

export default router;

