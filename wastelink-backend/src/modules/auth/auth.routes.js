import { Router } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabase.js';
import { tokenPair, verifyToken } from '../../utils/jwt.js';
import { catchAsync, Errors } from '../../utils/errors.js';
import { send } from '../../utils/response.js';
import { validate } from '../../middleware/validate.js';
import { protect } from '../../middleware/auth.js';
import {
  RegisterSchema,
  LoginSchema,
  RefreshSchema,
  ChangePasswordSchema,
} from '../../utils/schemas.js';

const router = Router();

// ── POST /auth/register ───────────────────────────────────────────
router.post('/register', validate(RegisterSchema), catchAsync(async (req, res) => {
  console.log('=== REGISTER HIT ===', req.body.email);
  
  try {
    const { email, password, full_name, phone, role, location, lat, lng } = req.body;

    console.log('=== CALLING CREATE USER ===');
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });
    console.log('=== AUTH RESULT ===', JSON.stringify({ 
      uid: authData?.user?.id, 
      error: authError 
    }, null, 2));

    if (authError) throw Errors.badRequest(authError.message);

    const uid = authData.user?.id;
    if (!uid) throw Errors.badRequest('Registration failed — no user ID returned');

    console.log('=== CALLING PROFILE INSERT ===');
    const { data: user, error: profileError } = await supabaseAdmin
      .from('users')
      .insert({ id: uid, email, full_name, phone, role, location, lat, lng })
      .select()
      .single();
    console.log('=== PROFILE RESULT ===', JSON.stringify({ user, error: profileError }, null, 2));

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw Errors.badRequest(`Profile creation failed: ${profileError.message}`);
    }

    const tokens = tokenPair(user);
    send.created(res, { user: sanitizeUser(user), ...tokens });

  } catch (err) {
    console.error('=== REGISTER CAUGHT ERROR ===', err);
    throw err;
  }
}));

// ── POST /auth/login ──────────────────────────────────────────────
router.post('/login', validate(LoginSchema), catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw Errors.unauthorized('Invalid email or password');

  const { data: user, error: profileError } = await supabaseAdmin
    .from('users')
    .select('*, recycler_profiles(*)')
    .eq('id', authData.user.id)
    .single();
  if (profileError || !user) throw Errors.unauthorized('User profile not found');
  if (!user.is_active) throw Errors.forbidden('Account has been deactivated');

  const tokens = tokenPair(user);
  send.ok(res, { user: sanitizeUser(user), ...tokens });
}));

// ── POST /auth/refresh ────────────────────────────────────────────
router.post('/refresh', validate(RefreshSchema), catchAsync(async (req, res) => {
  const decoded = verifyToken(req.body.refreshToken);

  const { data: user } = await supabaseAdmin
    .from('users').select('*, recycler_profiles(*)').eq('id', decoded.sub).single();
  if (!user || !user.is_active) throw Errors.unauthorized();

  const tokens = tokenPair(user);
  send.ok(res, tokens);
}));

// ── POST /auth/logout ─────────────────────────────────────────────
router.post('/logout', protect, catchAsync(async (_req, res) => {
  await supabase.auth.signOut();
  send.ok(res, { message: 'Logged out successfully' });
}));

// ── GET /auth/me ──────────────────────────────────────────────────
router.get('/me', protect, catchAsync(async (req, res) => {
  const { data: user } = await supabaseAdmin
    .from('users').select('*, recycler_profiles(*)').eq('id', req.user.id).single();
  send.ok(res, sanitizeUser(user));
}));

// ── POST /auth/change-password ────────────────────────────────────
router.post('/change-password', protect, validate(ChangePasswordSchema), catchAsync(async (req, res) => {
  const { current_password, new_password } = req.body;

  // Verify current password
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: req.user.email, password: current_password,
  });
  if (verifyError) throw Errors.unauthorized('Current password is incorrect');

  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
    password: new_password,
  });
  if (error) throw new Error(error.message);

  send.ok(res, { message: 'Password changed successfully' });
}));

// ── POST /auth/forgot-password ────────────────────────────────────
router.post('/forgot-password', catchAsync(async (req, res) => {
  const { email } = req.body;
  if (!email) throw Errors.badRequest('Email is required');

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
  });
  // Always respond 200 to avoid user enumeration
  send.ok(res, { message: 'If that email exists, a reset link has been sent.' });
}));

// ── Helper ────────────────────────────────────────────────────────
function sanitizeUser(user) {
  const { metadata, ...rest } = user;
  return rest;
}

export default router;