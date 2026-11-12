import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Allowed image types and the extension used for the stored file. SVG is not
// allowed because it can carry script.
const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Creates an uploader that stores one image under backend/<relativeDir> with a
// random server-generated name. The declared MIME type is checked; file contents
// are not inspected, so uploads are also served with nosniff and a strict CSP.
export const createImageUpload = (relativeDir) => {
  const destination = path.join(backendRoot, relativeDir);
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => fs.mkdir(destination, { recursive: true }, (err) => cb(err, destination)),
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`),
    }),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
      const error = new Error('Unsupported file type');
      error.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(error);
    },
  });
};

// Profile pictures (served from /uploads).
const upload = createImageUpload('uploads');

// Anonymous community post images (served from /uploads/posts).
export const postImageUpload = createImageUpload(path.join('uploads', 'posts'));

export default upload;
