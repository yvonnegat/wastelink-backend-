import { Router } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { protect, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { upload, uploadToSupabase } from '../../middleware/upload.js';
import { catchAsync, Errors } from '../../utils/errors.js';
import { send } from '../../utils/response.js';
import { UpdateProfileSchema, RecyclerProfileSchema } from '../../utils/schemas.js';

const router = Router();
router.use(protect);

// ── GET /users/me ─────────────────────────────────────────────────
router.get('/me', catchAsync(async (req, res) => {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select(`
      *,
      recycler_profiles (*)
      map_locations (*)
    `)
    .eq('id', req.user.id)
    .single();

  if (error) throw Errors.notFound('User');
  send.ok(res, user);
}));

// ── PATCH /users/me ───────────────────────────────────────────────
router.patch('/me', validate(UpdateProfileSchema), catchAsync(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  send.ok(res, data);
}));

// ── POST /users/me/avatar ─────────────────────────────────────────
router.post('/me/avatar', upload.single('avatar'), catchAsync(async (req, res) => {
  if (!req.file) throw Errors.badRequest('No file uploaded');

  const { url } = await uploadToSupabase(
    req.file.buffer,
    req.file.mimetype,
    `avatars/${req.user.id}`,
  );

  const { data } = await supabaseAdmin
    .from('users')
    .update({ avatar_url: url })
    .eq('id', req.user.id)
    .select('avatar_url')
    .single();

  send.ok(res, data);
}));

// ── GET /users/:id (public profile) ──────────────────────────────
router.get('/:id', catchAsync(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, full_name, role, location, rating, rating_count, avatar_url, is_verified, created_at, recycler_profiles(*)')
    .eq('id', req.params.id)
    .eq('is_active', true)
    .single();

  if (error || !data) throw Errors.notFound('User');
  send.ok(res, data);
}));

// ── Recycler profile ──────────────────────────────────────────────

// GET /users/me/recycler-profile
router.get('/me/recycler-profile', requireRole('recycler'), catchAsync(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('recycler_profiles')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (error) throw Errors.notFound('Recycler profile');
  send.ok(res, data);
}));

// PUT /users/me/recycler-profile (create or replace)
router.put('/me/recycler-profile', requireRole('recycler'), validate(RecyclerProfileSchema),
  catchAsync(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('recycler_profiles')
      .upsert({ user_id: req.user.id, ...req.body }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    send.ok(res, data);
  }),
);

// POST /users/me/recycler-profile/certificate
router.post('/me/recycler-profile/certificate', requireRole('recycler'),
  upload.single('certificate'), catchAsync(async (req, res) => {
    if (!req.file) throw Errors.badRequest('No file uploaded');

    const { url } = await uploadToSupabase(
      req.file.buffer, req.file.mimetype,
      `certificates/${req.user.id}`,
    );

    const { data } = await supabaseAdmin
      .from('recycler_profiles')
      .update({ certification_url: url, is_certified: true })
      .eq('user_id', req.user.id)
      .select()
      .single();

    send.ok(res, data);
  }),
);

export default router;
