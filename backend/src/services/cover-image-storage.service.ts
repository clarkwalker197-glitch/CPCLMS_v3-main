import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { del, put } from '@vercel/blob';
import { prisma } from '../config';
import { COVERS_DIR } from '../middlewares/upload';
import { AppError, BadRequestError } from '../utils/errors';

const COVER_FORMATS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export function coverExtensionForMimeType(mimeType: string): string | undefined {
  return COVER_FORMATS[mimeType as keyof typeof COVER_FORMATS];
}

export function hasMatchingImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/webp') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

async function storeLocalCoverImage(file: Pick<Express.Multer.File, 'buffer' | 'mimetype'>): Promise<string> {
  const format = COVER_FORMATS[file.mimetype as keyof typeof COVER_FORMATS]!;
  const filename = `cover-${randomUUID()}.${format}`;
  const filePath = path.join(COVERS_DIR, filename);

  await fs.writeFile(filePath, file.buffer);
  return `/uploads/covers/${filename}`;
}

export async function storeCoverImage(file: Pick<Express.Multer.File, 'buffer' | 'mimetype'>): Promise<string> {
  const format = COVER_FORMATS[file.mimetype as keyof typeof COVER_FORMATS];
  if (!format || !hasMatchingImageSignature(file.buffer, file.mimetype)) {
    throw new BadRequestError('Cover image must be a valid JPG, PNG, or WEBP image');
  }

  const hasReadWriteToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  const hasVercelOidc = Boolean(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID);
  if (hasReadWriteToken || hasVercelOidc) {
    try {
      const content = Uint8Array.from(file.buffer).buffer as ArrayBuffer;
      const blob = await put(`covers/cover-${randomUUID()}.${format}`, content, {
        access: 'public',
        contentType: file.mimetype,
        cacheControlMaxAge: 60 * 60 * 24 * 30,
      });
      return blob.url;
    } catch (error) {
      console.error('Vercel Blob cover upload failed:', error);
      throw new AppError('Could not store the cover image. Please try again.', 503);
    }
  }

  return storeLocalCoverImage(file);
}

function isManagedCoverImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname)
      && /^\/covers\/cover-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function tryResolveLocalCoverFile(value: string): string | null {
  let pathname: string;
  try {
    pathname = value.startsWith('/') ? value : new URL(value).pathname;
  } catch {
    return null;
  }

  if (!pathname.startsWith('/uploads/covers/')) return null;
  const filename = decodeURIComponent(pathname.slice('/uploads/covers/'.length));
  if (path.basename(filename) !== filename) return null;

  const filePath = path.resolve(COVERS_DIR, filename);
  if (!filePath.startsWith(`${path.resolve(COVERS_DIR)}${path.sep}`)) return null;
  return filePath;
}

export async function deleteUnreferencedCoverImage(value?: string | null): Promise<void> {
  if (!value) return;

  if (isManagedCoverImageUrl(value)) {
    const [bookReferences, ebookReferences] = await Promise.all([
      prisma.book.count({ where: { coverImage: value } }),
      prisma.eBook.count({ where: { coverImage: value } }),
    ]);
    if (bookReferences || ebookReferences) return;

    await del(value);
    return;
  }

  const filePath = tryResolveLocalCoverFile(value);
  if (!filePath) return;

  const [bookReferences, ebookReferences] = await Promise.all([
    prisma.book.count({ where: { coverImage: value } }),
    prisma.eBook.count({ where: { coverImage: value } }),
  ]);
  if (bookReferences || ebookReferences) return;

  await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

export async function tryDeleteNewCoverImage(value?: string | null): Promise<void> {
  if (!value) return;

  if (isManagedCoverImageUrl(value)) {
    try {
      await del(value);
    } catch (error) {
      console.error('Could not delete a newly uploaded cover image from Vercel Blob:', error);
    }
    return;
  }

  const filePath = tryResolveLocalCoverFile(value);
  if (!filePath) return;

  try {
    await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  } catch (error) {
    console.error('Could not delete a newly uploaded local cover image:', error);
  }
}

export async function tryDeleteUnreferencedCoverImage(value?: string | null): Promise<void> {
  try {
    await deleteUnreferencedCoverImage(value);
  } catch (error) {
    console.error('Could not delete an unreferenced cover image:', error);
  }
}