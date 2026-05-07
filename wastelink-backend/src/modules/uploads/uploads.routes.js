import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { upload, uploadToSupabase, deleteFromSupabase } from '../../middleware/upload.js';
import { catchAsync, Errors } from '../../utils/errors.js';
import { send } from '../../utils/response.js';
import { supabaseAdmin } from '../../config/supabase.js';

const router = Router();
router.use(protect);

// ── POST /uploads/single ─ general-purpose single upload ─────────
router.post('/single', upload.single('file'), catchAsync(async (req, res) => {
  if (!req.file) throw Errors.badRequest('No file provided');
  const folder = req.query.folder || `users/${req.user.id}/misc`;

  const { url, path } = await uploadToSupabase(req.file.buffer, req.file.mimetype, folder);
  send.created(res, { url, path, mimetype: req.file.mimetype, size: req.file.size });
}));

// ── POST /uploads/multiple ─ up to 10 files ────────────────────
router.post('/multiple', upload.array('files', 10), catchAsync(async (req, res) => {
  if (!req.files?.length) throw Errors.badRequest('No files provided');
  const folder = req.query.folder || `users/${req.user.id}/misc`;

  const results = [];
  for (const file of req.files) {
    const { url, path } = await uploadToSupabase(file.buffer, file.mimetype, folder);
    results.push({ url, path, originalname: file.originalname, size: file.size });
  }

  send.created(res, results);
}));

// ── DELETE /uploads ─ delete by storage path ──────────────────────
router.delete('/', catchAsync(async (req, res) => {
  const { path } = req.body;
  if (!path) throw Errors.badRequest('Storage path is required');

  // Only allow users to delete their own files
  if (!path.startsWith(`users/${req.user.id}`) &&
      !path.startsWith(`listings/`) &&
      !path.startsWith(`avatars/${req.user.id}`)) {
    throw Errors.forbidden('You cannot delete this file');
  }

  await deleteFromSupabase(path);
  send.noContent(res);
}));

export default router;
