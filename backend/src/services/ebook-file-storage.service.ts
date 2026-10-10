import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { del, put } from '@vercel/blob';
import { prisma } from '../config';
import { EBOOKS_DIR } from '../middlewares/upload';
import { AppError, BadRequestError } from '../utils/errors';
import { getBlobAuthenticationOptions, logBlobUploadFailure } from './blob-storage.service';

const EBOOK_FORMATS = {
  '.pdf': { format: 'PDF', mimeTypes: ['application/pdf'] },
  '.epub': { format: 'EPUB', mimeTypes: ['application/epub+zip', 'application/zip'] },
  '.mobi': { format: 'MOBI', mimeTypes: ['application/x-mobipocket-ebook', 'application/octet-stream'] },
} as const;

const MANAGED_EBOOK_BLOB_URL =
  /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/ebooks\/ebook-[0-9a-f-]{36}\.(?:pdf|epub|mobi)$/i;
const LEGACY_LOCAL_EBOOK_URL = /^\/uploads\/ebooks\/([^/\\]+)$/;
const MAX_EBOOK_FILE_SIZE = 50 * 1024 * 1024;

function validateEBookFile(file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname' | 'size'>): 'PDF' | 'EPUB' | 'MOBI' {
  const extension = path.extname(file.originalname).toLowerCase() as keyof typeof EBOOK_FORMATS;
  const details = EBOOK_FORMATS[extension];
  if (!details) throw new BadRequestError('E-book file must be a PDF, EPUB, or MOBI file');
  if (file.size > MAX_EBOOK_FILE_SIZE) throw new BadRequestError('E-book file must be no larger than 50 MB');

  const mimeType = file.mimetype.toLowerCase();
  if (mimeType && mimeType !== 'application/octet-stream' && !details.mimeTypes.some((supportedType) => supportedType === mimeType)) {
    throw new BadRequestError(`The selected file type does not match its .${extension.slice(1)} extension`);
  }

  const isPdf = extension === '.pdf'
    && file.buffer.length >= 5
    && file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  const isEpub = extension === '.epub'
    && file.buffer.length >= 4
    && file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const isMobi = extension === '.mobi'
    && file.buffer.length >= 68
    && file.buffer.toString('ascii', 60, 68) === 'BOOKMOBI';
  if (!isPdf && !isEpub && !isMobi) {
    throw new BadRequestError('The selected file does not appear to be a valid PDF, EPUB, or MOBI e-book');
  }

  return details.format;
}

async function storeLocalEBookFile(
  file: Pick<Express.Multer.File, 'buffer' | 'originalname'>
): Promise<string> {
  const extension = path.extname(file.originalname).toLowerCase();
  const filename = `ebook-${randomUUID()}${extension}`;
  await fs.writeFile(path.join(EBOOKS_DIR, filename), file.buffer);
  return `/uploads/ebooks/${filename}`;
}

export async function storeEBookFile(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname' | 'size'>
): Promise<{ fileUrl: string; format: 'PDF' | 'EPUB' | 'MOBI'; fileSize: number }> {
  const format = validateEBookFile(file);
  const extension = path.extname(file.originalname).toLowerCase();
  const blobAuthentication = getBlobAuthenticationOptions();

  if (!blobAuthentication) {
    return {
      fileUrl: await storeLocalEBookFile(file),
      format,
      fileSize: file.size,
    };
  }

  try {
    const content = Uint8Array.from(file.buffer).buffer as ArrayBuffer;
    const blob = await put(`ebooks/ebook-${randomUUID()}${extension}`, content, {
      ...blobAuthentication,
      access: 'public',
      contentType: file.mimetype || EBOOK_FORMATS[extension as keyof typeof EBOOK_FORMATS].mimeTypes[0],
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    });
    return { fileUrl: blob.url, format, fileSize: file.size };
  } catch (error) {
    throw new AppError(logBlobUploadFailure('ebook', error), 503);
  }
}

async function deleteEBookFile(value: string): Promise<void> {
  if (MANAGED_EBOOK_BLOB_URL.test(value)) {
    await del(value);
    return;
  }

  const match = LEGACY_LOCAL_EBOOK_URL.exec(value);
  if (!match || path.basename(match[1]) !== match[1]) return;
  const filePath = path.resolve(EBOOKS_DIR, match[1]);
  if (!filePath.startsWith(`${path.resolve(EBOOKS_DIR)}${path.sep}`)) return;
  await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

export async function tryDeleteNewEBookFile(value?: string | null): Promise<void> {
  if (!value) return;
  try {
    await deleteEBookFile(value);
  } catch (error) {
    console.error('Could not delete a newly uploaded e-book file:', error);
  }
}

export async function tryDeleteUnreferencedEBookFile(value?: string | null): Promise<void> {
  if (!value) return;
  try {
    if (!MANAGED_EBOOK_BLOB_URL.test(value) && !LEGACY_LOCAL_EBOOK_URL.test(value)) return;
    const references = await prisma.eBook.count({ where: { fileUrl: value } });
    if (references === 0) await deleteEBookFile(value);
  } catch (error) {
    console.error('Could not delete an unreferenced e-book file:', error);
  }
}
