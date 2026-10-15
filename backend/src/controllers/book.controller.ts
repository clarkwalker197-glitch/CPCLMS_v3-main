// ============================================================
// Book & Category Controller
// ============================================================

import { Request, Response } from 'express';
import { bookService } from '../services';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/helpers';
import { storeCoverImage, tryDeleteNewCoverImage, tryDeleteUnreferencedCoverImage } from '../services/cover-image-storage.service';
import { AuthenticatedRequest } from '../types';

// ============================================================
// Physical Books
// ============================================================

/**
 * GET /api/books
 */
export const listBooks = asyncHandler(async (req: Request, res: Response) => {
  const { books, meta } = await bookService.listBooks(req.query as Record<string, unknown>);
  sendSuccess(res, books, undefined, 200, meta);
});

/**
 * GET /api/books/:id
 */
export const getBook = asyncHandler(async (req: Request, res: Response) => {
  const book = await bookService.getBookById(req.params.id);
  sendSuccess(res, book);
});

/**
 * POST /api/books
 */
export const createBook = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const uploadedCover = req.file ? await storeCoverImage(req.file) : undefined;
  try {
    const book = await bookService.createBook({
      ...req.body,
      ...(uploadedCover ? { coverImage: uploadedCover } : {}),
    }, {
      userId: req.user!.userId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, book, 'Book created successfully', 201);
  } catch (error) {
    if (uploadedCover) await tryDeleteNewCoverImage(uploadedCover);
    throw error;
  }
});

/**
 * PUT /api/books/:id
 */
export const updateBook = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existingBook = req.file ? await bookService.getBookById(req.params.id) : null;
  const uploadedCover = req.file ? await storeCoverImage(req.file) : undefined;
  try {
    const book = await bookService.updateBook(req.params.id, {
      ...req.body,
      ...(uploadedCover ? { coverImage: uploadedCover } : {}),
    }, {
      userId: req.user!.userId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (uploadedCover && existingBook?.coverImage !== uploadedCover) {
      await tryDeleteUnreferencedCoverImage(existingBook?.coverImage);
    }
    sendSuccess(res, book, 'Book updated successfully');
  } catch (error) {
    if (uploadedCover) await tryDeleteNewCoverImage(uploadedCover);
    throw error;
  }
});

/**
 * DELETE /api/books/:id
 */
export const deleteBook = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await bookService.deleteBook(req.params.id, {
    userId: req.user!.userId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, null, 'Book deleted successfully');
});

// ============================================================
// Categories
// ============================================================

/**
 * GET /api/categories
 */
export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await bookService.listCategories();
  sendSuccess(res, categories);
});

/**
 * GET /api/categories/:id
 */
export const getCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await bookService.getCategoryById(req.params.id);
  sendSuccess(res, category);
});

/**
 * POST /api/categories
 */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await bookService.createCategory(req.body);
  sendSuccess(res, category, 'Category created successfully', 201);
});

/**
 * PUT /api/categories/:id
 */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await bookService.updateCategory(req.params.id, req.body);
  sendSuccess(res, category, 'Category updated successfully');
});

/**
 * DELETE /api/categories/:id
 */
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  await bookService.deleteCategory(req.params.id);
  sendSuccess(res, null, 'Category deleted successfully');
});
