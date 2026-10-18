// ============================================================
// E-Book Routes
// ============================================================

import { Router } from 'express';
import * as ebookController from '../controllers/ebook.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { uploadEBookFiles } from '../middlewares/upload';
import { createEBookSchema, updateEBookSchema, uploadEBookSchema } from '../validators/book.schema';

const router = Router();

// Public routes (any authenticated user can view)
router.get('/', ebookController.listEBooks);
router.get('/:id/view-logs', authenticate, authorize('LIBRARIAN'), ebookController.getEBookViewLogs);
router.get('/:id', ebookController.getEBook);
router.post('/:id/views', authenticate, authorize('STUDENT', 'FACULTY'), ebookController.recordEBookView);

// Librarian-only (CRUD management)
router.post(
  '/',
  authenticate,
  authorize('LIBRARIAN'),
  uploadEBookFiles,
  validate(createEBookSchema),
  ebookController.createEBook
);
router.post(
  '/upload',
  authenticate,
  authorize('LIBRARIAN'),
  uploadEBookFiles,
  validate(uploadEBookSchema),
  ebookController.createEBook
);
router.put(
  '/:id',
  authenticate,
  authorize('LIBRARIAN'),
  uploadEBookFiles,
  validate(updateEBookSchema),
  ebookController.updateEBook
);
router.delete(
  '/:id',
  authenticate,
  authorize('LIBRARIAN'),
  ebookController.deleteEBook
);

export default router;
