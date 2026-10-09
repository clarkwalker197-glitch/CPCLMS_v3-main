import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { del, put } from '@vercel/blob';
import { prisma } from '../config';
import { PROFILES_DIR } from '../middlewares/upload';
import { coverExtensionForMimeType, hasMatchingImageSignature } from './cover-image-storage.service';
import { AppError, BadRequestError } from '../utils/errors';

const PROFILE_BLOB_URL = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/profiles\/profile-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
const LEGACY_PROFILE_FILENAME = /^\d+-[a-zA-Z0-9-]*\.(?:jpe?g|png|webp)$/i;

export async function storeProfileImage(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype'>
): Promise<string> {
  const extension = coverExtensionForMimeType(file.mimetype);
  if (!extension || !hasMatchingImageSignature(file.buffer, file.mimetype)) {
    throw new BadRequestError('Profile picture must be a valid JPG, PNG, or WEBP image');
  }

  const hasReadWriteToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  const hasVercelOidc = Boolean(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID);
  if (!hasReadWriteToken && !hasVercelOidc) {
    throw new AppError(
      'Profile image storage is not configured. Please contact an administrator.',
      503
    );
  }

  try {
    const content = Uint8Array.from(file.buffer).buffer as ArrayBuffer;
    const blob = await put(`profiles/profile-${randomUUID()}.${extension}`, content, {
      access: 'public',
      contentType: file.mimetype,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    });
    return blob.url;
  } catch (error) {
    console.error('Vercel Blob profile image upload failed:', error);
    throw new AppError('Could not store the profile picture. Please try again.', 503);
  }
}

export async function tryDeleteNewProfileImage(value?: string | null): Promise<void> {
  if (!value || !PROFILE_BLOB_URL.test(value)) return;
  try {
    await del(value);
  } catch (error) {
    console.error('Could not delete a newly uploaded profile image from Vercel Blob:', error);
  }
}

export async function tryDeleteUnreferencedProfileImage(value?: string | null): Promise<void> {
  if (!value) return;

  try {
    if (PROFILE_BLOB_URL.test(value)) {
      const references = await prisma.user.count({ where: { avatar: value } });
      if (references === 0) await del(value);
      return;
    }

    let pathname: string;
    try {
      pathname = value.startsWith('/')
        ? value
        : new URL(value).pathname;
    } catch {
      return;
    }
    const prefix = '/uploads/profiles/';
    if (!pathname.startsWith(prefix)) return;
    const filename = decodeURIComponent(pathname.slice(prefix.length));
    if (path.basename(filename) !== filename || !LEGACY_PROFILE_FILENAME.test(filename)) return;

    const references = await prisma.user.count({ where: { avatar: value } });
    if (references > 0) return;

    const filePath = path.resolve(PROFILES_DIR, filename);
    if (!filePath.startsWith(`${path.resolve(PROFILES_DIR)}${path.sep}`)) return;
    await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  } catch (error) {
    console.error('Could not clean up an unreferenced profile image:', error);
  }
}
