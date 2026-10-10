import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { del, put } from '@vercel/blob';
import { prisma } from '../config';
import { PROFILES_DIR } from '../middlewares/upload';
import { coverExtensionForMimeType, hasMatchingImageSignature } from './cover-image-storage.service';
import { AppError, BadRequestError } from '../utils/errors';
import { getBlobAuthenticationOptions, logBlobUploadFailure } from './blob-storage.service';

const PROFILE_BLOB_URL = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/profiles\/profile-[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
const LEGACY_PROFILE_FILENAME = /^\d+-[a-zA-Z0-9-]*\.(?:jpe?g|png|webp)$/i;
const PROFILE_LOCAL_URL = /^\/uploads\/profiles\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i;

async function storeLocalProfileImage(file: Pick<Express.Multer.File, 'buffer' | 'mimetype'>): Promise<string> {
  const extension = coverExtensionForMimeType(file.mimetype)!;
  const filename = `profile-${randomUUID()}.${extension}`;
  const filePath = path.join(PROFILES_DIR, filename);

  await fs.writeFile(filePath, file.buffer);
  return `/uploads/profiles/${filename}`;
}

export async function storeProfileImage(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype'>
): Promise<string> {
  const extension = coverExtensionForMimeType(file.mimetype);
  if (!extension || !hasMatchingImageSignature(file.buffer, file.mimetype)) {
    throw new BadRequestError('Profile picture must be a valid JPG, PNG, or WEBP image');
  }

  const blobAuthentication = getBlobAuthenticationOptions();
  if (blobAuthentication) {
    try {
      const content = Uint8Array.from(file.buffer).buffer as ArrayBuffer;
      const blob = await put(`profiles/profile-${randomUUID()}.${extension}`, content, {
        ...blobAuthentication,
        access: 'public',
        contentType: file.mimetype,
        cacheControlMaxAge: 60 * 60 * 24 * 30,
      });
      return blob.url;
    } catch (error) {
      throw new AppError(logBlobUploadFailure('profile', error), 503);
    }
  }

  return storeLocalProfileImage(file);
}

function getLocalAssetPath(value: string, prefix: string): string | null {
  let pathname: string;
  try {
    pathname = value.startsWith('/') ? value : new URL(value).pathname;
  } catch {
    return null;
  }

  if (!pathname.startsWith(prefix)) return null;
  const filename = decodeURIComponent(pathname.slice(prefix.length));
  if (path.basename(filename) !== filename) return null;
  return path.resolve(PROFILES_DIR, path.basename(filename));
}

export async function tryDeleteNewProfileImage(value?: string | null): Promise<void> {
  if (!value) return;

  if (PROFILE_BLOB_URL.test(value)) {
    try {
      await del(value);
    } catch (error) {
      console.error('Could not delete a newly uploaded profile image from Vercel Blob:', error);
    }
    return;
  }

  if (!PROFILE_LOCAL_URL.test(value)) return;

  const filePath = value.startsWith('/') ? path.resolve(PROFILES_DIR, path.basename(value)) : null;
  if (!filePath) return;

  try {
    await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  } catch (error) {
    console.error('Could not delete a newly uploaded local profile image:', error);
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

    const prefix = '/uploads/profiles/';
    let pathname: string;
    try {
      pathname = value.startsWith('/') ? value : new URL(value).pathname;
    } catch {
      return;
    }
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
