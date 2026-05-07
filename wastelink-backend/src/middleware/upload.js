import multer from 'multer';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/errors.js';
import { v4 as uuid } from 'uuid';

const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
const BUCKET   = process.env.SUPABASE_STORAGE_BUCKET || 'wastelink-uploads';

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
]);

// Use memory storage — we pipe bytes to Supabase
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new AppError(`File type ${file.mimetype} not allowed`, 400, 'INVALID_FILE_TYPE'));
  },
});

/**
 * Upload a single file buffer to Supabase Storage.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} folder  e.g. 'listings/uuid'
 * @returns {{ url: string, path: string }}
 */
export async function uploadToSupabase(buffer, mimetype, folder = 'misc') {
  const ext      = mimetype.split('/')[1].replace('jpeg', 'jpg');
  const fileName = `${uuid()}.${ext}`;
  const path     = `${folder}/${fileName}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimetype, upsert: false });

  if (error) throw new AppError(`Upload failed: ${error.message}`, 500, 'UPLOAD_FAILED');

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFromSupabase(storagePath) {
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
  if (error) throw new AppError(`Delete failed: ${error.message}`, 500, 'DELETE_FAILED');
}
