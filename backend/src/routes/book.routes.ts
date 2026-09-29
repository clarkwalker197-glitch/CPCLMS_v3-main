// ============================================================
// Book & Category Routes
// ============================================================

import { Router } from 'express';
import { bookController } from '../controllers';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { uploadBookCover } from '../middlewares/upload';
import { createBookSchema, updateBookSchema, createCategorySchema } from '../validators/book.schema';

const router = Router();

// Physical Books
router.get('/', bookController.listBooks);
router.get('/:id', bookController.getBook);

// Librarian-only
// JSON requests preserve the pasted-URL flow; multipart requests are reserved
// for a selected cover file and are uploaded to persistent object storage.
router.post(
  '/',
  authenticate,
  authorize('LIBRARIAN'),
  uploadBookCover,
  validate(createBookSchema),
  bookController.createBook
);
router.put(
  '/:id',
  authenticate,
  authorize('LIBRARIAN'),
  uploadBookCover,
  validate(updateBookSchema),
  bookController.updateBook
);
router.delete('/:id', authenticate, authorize('LIBRARIAN'), bookController.deleteBook);

export default router;

