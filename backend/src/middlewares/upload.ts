// ============================================================
// File Upload Middleware (Multer) — e-book files + cover images
// ============================================================

import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { BadRequestError } from '../utils/errors';

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');
const EBOOKS_DIR = path.join(UPLOADS_ROOT, 'ebooks');
const COVERS_DIR = path.join(UPLOADS_ROOT, 'covers');

for (const dir of [EBOOKS_DIR, COVERS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const EBOOK_EXTENSIONS: Record<string, 'PDF' | 'EPUB' | 'MOBI'> = {
  '.pdf': 'PDF',
  '.epub': 'EPUB',
  '.mobi': 'MOBI',
};
const COVER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function safeFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const base = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 60);
  return `${Date.now()}-${base}${ext.toLowerCase()}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.fieldname === 'coverImage' ? COVERS_DIR : EBOOKS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, safeFilename(file.originalname));
  },
});

function fileFilter(
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === 'coverImage') {
    if (!COVER_EXTENSIONS.has(ext)) {
      return cb(new BadRequestError('Cover image must be a JPG, PNG, or WEBP file'));
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
  storage,
  fileFilter,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB per file
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
]);

// Physical books only ever need a cover image (no e-book file field).
export const uploadBookCover = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('coverImage');

/**
 * If a cover image file was uploaded (multipart), turn it into the same
 * `coverImage` URL field the JSON/validation path expects, so one route
 * can accept either a plain JSON body (existing "paste a URL" flow) or a
 * multipart request with an actual file — the Zod schema downstream
 * doesn't need to know which happened.
 */
export function attachUploadedCoverUrl(req: any, _res: any, next: any) {
  if (req.file) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    req.body.coverImage = `${baseUrl}/uploads/covers/${req.file.filename}`;
  }
  next();
}


export function formatFromExtension(originalName: string): 'PDF' | 'EPUB' | 'MOBI' {
  const ext = path.extname(originalName).toLowerCase();
  return EBOOK_EXTENSIONS[ext] || 'PDF';
}

export { EBOOKS_DIR, COVERS_DIR, UPLOADS_ROOT };
