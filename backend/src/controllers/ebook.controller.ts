// ============================================================
// E-Book Controller
// ============================================================

import { Request, Response } from 'express';
import { ebookService } from '../services';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/helpers';
import { BadRequestError } from '../utils/errors';
import { storeCoverImage, tryDeleteNewCoverImage } from '../services/cover-image-storage.service';
import { storeEBookFile, tryDeleteNewEBookFile, tryDeleteUnreferencedEBookFile } from '../services/ebook-file-storage.service';

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
 * POST /api/ebooks and the legacy POST /api/ebooks/upload route
 */
export const createEBook = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as { ebookFile?: Express.Multer.File[]; file?: Express.Multer.File[]; coverImage?: Express.Multer.File[] } | undefined;
  const uploadedFile = files?.ebookFile?.[0] || files?.file?.[0];
  const uploadedCover = files?.coverImage?.[0];
  const storedFile = uploadedFile ? await storeEBookFile(uploadedFile) : null;
  let uploadedCoverUrl: string | undefined;
  try {
    uploadedCoverUrl = uploadedCover ? await storeCoverImage(uploadedCover) : undefined;
    const fileUrl = storedFile?.fileUrl || req.body.fileUrl;
    if (!fileUrl) {
      throw new BadRequestError('Choose an e-book file to upload or provide a valid file URL');
    }

    const ebook = await ebookService.createEBook({
      ...req.body,
      fileUrl,
      ...(storedFile
        ? {
            fileSize: storedFile.fileSize,
            format: req.body.format || storedFile.format,
          }
        : {}),
      ...(uploadedCoverUrl ? { coverImage: uploadedCoverUrl } : {}),
    });

    sendSuccess(res, ebook, storedFile ? 'E-Book uploaded successfully' : 'E-Book created successfully', 201);
  } catch (error) {
    if (storedFile) await tryDeleteNewEBookFile(storedFile.fileUrl);
    if (uploadedCoverUrl) await tryDeleteNewCoverImage(uploadedCoverUrl);
    throw error;
  }
});

/**
 * PUT /api/ebooks/:id
 */
export const updateEBook = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as { ebookFile?: Express.Multer.File[]; file?: Express.Multer.File[] } | undefined;
  const uploadedFile = files?.ebookFile?.[0] || files?.file?.[0];
  const existingEBook = uploadedFile ? await ebookService.getEBookById(req.params.id) : null;
  const storedFile = uploadedFile ? await storeEBookFile(uploadedFile) : null;

  try {
    const ebook = await ebookService.updateEBook(req.params.id, {
      ...req.body,
      ...(storedFile
        ? {
            fileUrl: storedFile.fileUrl,
            fileSize: storedFile.fileSize,
            format: req.body.format || storedFile.format,
          }
        : {}),
    });
    if (storedFile && existingEBook?.fileUrl !== storedFile.fileUrl) {
      await tryDeleteUnreferencedEBookFile(existingEBook?.fileUrl);
    }
    sendSuccess(res, ebook, 'E-Book updated successfully');
  } catch (error) {
    if (storedFile) await tryDeleteNewEBookFile(storedFile.fileUrl);
    throw error;
  }
});

/**
 * DELETE /api/ebooks/:id
 */
export const deleteEBook = asyncHandler(async (req: Request, res: Response) => {
  await ebookService.deleteEBook(req.params.id);
  sendSuccess(res, null, 'E-Book deleted successfully');
});
