// ============================================================
// E-Book Controller
// ============================================================

import { Request, Response } from 'express';
import { ebookService } from '../services';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/helpers';
import { BadRequestError } from '../utils/errors';
import { formatFromExtension } from '../middlewares/upload';
import { normalizeClassificationNumber } from '../constants/categories';

/**
 * GET /api/ebooks
 */
export const listEBooks = asyncHandler(async (req: Request, res: Response) => {
  const { ebooks, meta } = await ebookService.listEBooks(req.query as Record<string, unknown>);
  sendSuccess(res, ebooks, undefined, 200, meta);
});

/**
 * GET /api/ebooks/:id
 */
export const getEBook = asyncHandler(async (req: Request, res: Response) => {
  const ebook = await ebookService.getEBookById(req.params.id);
  sendSuccess(res, ebook);
});

/**
 * POST /api/ebooks
 */
export const createEBook = asyncHandler(async (req: Request, res: Response) => {
  const ebook = await ebookService.createEBook(req.body);
  sendSuccess(res, ebook, 'E-Book created successfully', 201);
});

/**
 * POST /api/ebooks/upload
 * Accepts multipart/form-data: file (required), coverImage (optional),
 * plus the same text fields as POST /api/ebooks (isbn, title, author, ...).
 */
export const uploadEBook = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as { file?: Express.Multer.File[]; coverImage?: Express.Multer.File[] } | undefined;
  const uploadedFile = files?.file?.[0];
  const uploadedCover = files?.coverImage?.[0];

  if (!uploadedFile) {
    throw new BadRequestError('An e-book file is required');
  }

  const { isbn, title, author, publisher, publishYear, edition, categoryId, classificationNumber, description, language, coverImage: coverImageUrl } = req.body;

  if (!isbn || !title || !author || !categoryId || !classificationNumber) {
    throw new BadRequestError('ISBN, title, author, category, and classification number are required');
  }
  const normalizedClassificationNumber = normalizeClassificationNumber(classificationNumber);
  if (!normalizedClassificationNumber) {
    throw new BadRequestError('Classification number must be between 000 and 999 with up to 5 decimal places');
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const fileUrl = `${baseUrl}/uploads/ebooks/${uploadedFile.filename}`;
  const coverImage = uploadedCover
    ? `${baseUrl}/uploads/covers/${uploadedCover.filename}`
    : coverImageUrl || undefined;

  const ebook = await ebookService.createEBook({
    isbn,
    title,
    author,
    publisher: publisher || undefined,
    publishYear: publishYear ? Number(publishYear) : undefined,
    edition: edition || undefined,
    categoryId: categoryId || undefined,
    classificationNumber: normalizedClassificationNumber,
    description: description || undefined,
    coverImage,
    language: language || 'English',
    fileUrl,
    fileSize: uploadedFile.size,
    format: formatFromExtension(uploadedFile.originalname),
  });

  sendSuccess(res, ebook, 'E-Book uploaded successfully', 201);
});

/**
 * PUT /api/ebooks/:id
 */
export const updateEBook = asyncHandler(async (req: Request, res: Response) => {
  const ebook = await ebookService.updateEBook(req.params.id, req.body);
  sendSuccess(res, ebook, 'E-Book updated successfully');
});

/**
 * DELETE /api/ebooks/:id
 */
export const deleteEBook = asyncHandler(async (req: Request, res: Response) => {
  await ebookService.deleteEBook(req.params.id);
  sendSuccess(res, null, 'E-Book deleted successfully');
});


