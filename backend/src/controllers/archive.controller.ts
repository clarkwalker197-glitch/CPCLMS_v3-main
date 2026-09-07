import { Request, Response } from 'express';
import { authService, bookService, ebookService } from '../services';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/helpers';

export const listArchive = asyncHandler(async (_req: Request, res: Response) => {
  const [books, ebooks, users] = await Promise.all([
    bookService.listArchivedBooks(),
    ebookService.listArchivedEBooks(),
    authService.listArchivedUsers(),
  ]);
  sendSuccess(res, { books, ebooks, users });
});

export const restoreBook = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await bookService.restoreBook(req.params.id), 'Book restored successfully');
});

export const restoreEBook = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await ebookService.restoreEBook(req.params.id), 'E-Book restored successfully');
});

export const restoreUser = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await authService.restoreUser(req.params.id), 'User restored successfully');
});