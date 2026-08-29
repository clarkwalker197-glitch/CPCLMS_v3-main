// ============================================================
// Book & Category Routes
// ============================================================

import { Router } from 'express';
import { bookController } from '../controllers';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { uploadBookCover, attachUploadedCoverUrl } from '../middlewares/upload';
import { createBookSchema, updateBookSchema, createCategorySchema } from '../validators/book.schema';

const router = Router();

// Physical Books
router.get('/', bookController.listBooks);
router.get('/:id', bookController.getBook);

// Librarian-only
// uploadBookCover/attachUploadedCoverUrl are no-ops for plain JSON requests
// (no cover file attached) — they only kick in when the request is
// multipart/form-data with a `coverImage` file, letting one route accept
// either a pasted cover URL or an actual uploaded image.
router.post(
  '/',
  authenticate,
  authorize('LIBRARIAN'),
  uploadBookCover,
  attachUploadedCoverUrl,
  validate(createBookSchema),
  bookController.createBook
);
router.put(
  '/:id',
  authenticate,
  authorize('LIBRARIAN'),
  uploadBookCover,
  attachUploadedCoverUrl,
  validate(updateBookSchema),
  bookController.updateBook
);
router.delete('/:id', authenticate, authorize('LIBRARIAN'), bookController.deleteBook);

export default router;

