// ============================================================
// File Upload Middleware (Multer) — e-book files + cover images
// ============================================================

import fs from 'fs';
import path from 'path';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { BadRequestError } from '../utils/errors';
import { coverExtensionForMimeType } from '../services/cover-image-storage.service';

const candidateRoots = [
  process.env.CPCLMS_BACKEND_ROOT,
  process.cwd(),
  path.join(process.cwd(), 'backend'),
  path.resolve(__dirname, '..', '..'),
  path.resolve(__dirname, '..', '..', '..'),
].filter((root): root is string => Boolean(root));
const backendRoot = candidateRoots.find((root) =>
  fs.existsSync(path.join(root, 'prisma', 'schema.prisma'))
) ?? candidateRoots.find((root) => path.basename(root).toLowerCase() === 'backend') ?? path.join(process.cwd(), 'backend');
const UPLOADS_ROOT = path.join(backendRoot, 'uploads');
const EBOOKS_DIR = path.join(UPLOADS_ROOT, 'ebooks');
const PROFILES_DIR = path.join(UPLOADS_ROOT, 'profiles');

for (const dir of [EBOOKS_DIR, PROFILES_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const EBOOK_EXTENSIONS: Record<string, 'PDF' | 'EPUB' | 'MOBI'> = {
  '.pdf': 'PDF',
  '.epub': 'EPUB',
  '.mobi': 'MOBI',
};
const COVER_EXTENSIONS: Record<string, readonly string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};
const MAX_COVER_SIZE = 5 * 1024 * 1024;
function safeFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const base = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 60);
  return `${Date.now()}-${base}${ext.toLowerCase()}`;
}

const ebookDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, EBOOKS_DIR),
  filename: (req, file, cb) => {
    cb(null, safeFilename(file.originalname));
  },
});
const memoryStorage = multer.memoryStorage();
const boundedCoverMemoryStorage: multer.StorageEngine = {
  _handleFile(_req, file, cb) {
    const chunks: Buffer[] = [];
    let size = 0;
    let callbackCalled = false;
    file.stream.on('data', (chunk: Buffer) => {
      if (callbackCalled) return;
      size += chunk.length;
      if (size > MAX_COVER_SIZE) {
        callbackCalled = true;
        cb(new multer.MulterError('LIMIT_FILE_SIZE', file.fieldname));
        return;
      }
      chunks.push(chunk);
    });
    file.stream.on('error', (error) => {
      if (callbackCalled) return;
      callbackCalled = true;
      cb(error);
    });
    file.stream.on('end', () => {
      if (callbackCalled) return;
      callbackCalled = true;
      cb(null, { buffer: Buffer.concat(chunks), size });
    });
  },
  _removeFile(_req, _file, cb) {
    cb(null);
  },
};
const ebookUploadStorage: multer.StorageEngine = {
  _handleFile(req, file, cb) {
    const storage = file.fieldname === 'coverImage' ? boundedCoverMemoryStorage : ebookDiskStorage;
    storage._handleFile(req, file, cb);
  },
  _removeFile(req, file, cb) {
    const storage = file.fieldname === 'coverImage' ? boundedCoverMemoryStorage : ebookDiskStorage;
    storage._removeFile(req, file, cb);
  },
};

function fileFilter(
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === 'coverImage' || file.fieldname === 'profilePicture') {
    const extension = coverExtensionForMimeType(file.mimetype);
    const validProfileExtension = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    const validCoverExtension = COVER_EXTENSIONS[file.mimetype]?.includes(ext);
    if (!extension || (file.fieldname === 'coverImage' && !validCoverExtension) || (file.fieldname === 'profilePicture' && !validProfileExtension)) {
      const label = file.fieldname === 'coverImage' ? 'Cover image' : 'Profile picture';
      return cb(new BadRequestError(`${label} must be a JPG, PNG, or WEBP image`));
    }
    return cb(null, true);
  }
  if (file.fieldname === 'file') {
    if (!EBOOK_EXTENSIONS[ext]) {
      return cb(new BadRequestError('E-book file must be a PDF, EPUB, or MOBI file'));
    }
    return cb(null, true);
  }
  cb(new BadRequestError('Unexpected file field'));
}

export const uploadEBookFiles = multer({
  storage: ebookUploadStorage,
  fileFilter,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB per file
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
]);

// Physical books only ever need a cover image (no e-book file field).
const parseBookCoverUpload = multer({
  storage: memoryStorage,
  fileFilter,
  limits: { fileSize: MAX_COVER_SIZE },
}).single('coverImage');
export const uploadBookCover = (req: Request, res: Response, next: NextFunction) => {
  parseBookCoverUpload(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    if (req.is('multipart/form-data') && !req.file) {
      next(new BadRequestError('A cover image file is required for multipart uploads'));
      return;
    }
    next();
  });
};

export const uploadProfilePicture = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PROFILES_DIR),
    filename: (_req, file, cb) => cb(null, safeFilename(file.originalname)),
  }),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('profilePicture');

export function formatFromExtension(originalName: string): 'PDF' | 'EPUB' | 'MOBI' {
  const ext = path.extname(originalName).toLowerCase();
  return EBOOK_EXTENSIONS[ext] || 'PDF';
}

export { EBOOKS_DIR, PROFILES_DIR, UPLOADS_ROOT };
