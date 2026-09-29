import { randomUUID } from 'crypto';
import { del, put } from '@vercel/blob';
import { prisma } from '../config';
import { AppError, BadRequestError } from '../utils/errors';

const COVER_FORMATS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export function coverExtensionForMimeType(mimeType: string): string | undefined {
  return COVER_FORMATS[mimeType as keyof typeof COVER_FORMATS];
}

function hasMatchingImageSignature(buffer: Buffer, mimeType: string): boolean {
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

export async function storeCoverImage(file: Pick<Express.Multer.File, 'buffer' | 'mimetype'>): Promise<string> {
  const format = COVER_FORMATS[file.mimetype as keyof typeof COVER_FORMATS];
  if (!format || !hasMatchingImageSignature(file.buffer, file.mimetype)) {
    throw new BadRequestError('Cover image must be a valid JPG, PNG, or WEBP image');
  }

  const hasReadWriteToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  const hasVercelOidc = Boolean(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID);
  if (!hasReadWriteToken && !hasVercelOidc) {
    throw new AppError('Cover image storage is not configured. Contact an administrator.', 503);
  }

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

export async function deleteUnreferencedCoverImage(value?: string | null): Promise<void> {
  if (!value || !isManagedCoverImageUrl(value)) return;

  const [bookReferences, ebookReferences] = await Promise.all([
    prisma.book.count({ where: { coverImage: value } }),
    prisma.eBook.count({ where: { coverImage: value } }),
  ]);
  if (bookReferences || ebookReferences) return;

  await del(value);
}

export async function tryDeleteNewCoverImage(value?: string | null): Promise<void> {
  if (!value || !isManagedCoverImageUrl(value)) return;
  try {
    await del(value);
  } catch (error) {
    console.error('Could not delete a newly uploaded cover image from Vercel Blob:', error);
  }
}

export async function tryDeleteUnreferencedCoverImage(value?: string | null): Promise<void> {
  try {
    await deleteUnreferencedCoverImage(value);
  } catch (error) {
    console.error('Could not delete an unreferenced cover image from Vercel Blob:', error);
  }
}