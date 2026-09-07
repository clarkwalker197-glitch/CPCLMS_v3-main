import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import * as archiveController from '../controllers/archive.controller';

const router = Router();
router.use(authenticate, authorize('LIBRARIAN'));
router.get('/', archiveController.listArchive);
router.patch('/books/:id/restore', archiveController.restoreBook);
router.patch('/ebooks/:id/restore', archiveController.restoreEBook);
router.patch('/users/:id/restore', archiveController.restoreUser);

export default router;