import { verifyToken } from '../utils/jwt.js';
import { Errors, catchAsync } from '../utils/errors.js';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * protect — verifies JWT and attaches req.user
 */
export const protect = catchAsync(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw Errors.unauthorized('No token provided');

  const token   = header.split(' ')[1];
  const decoded = verifyToken(token);

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, email, full_name, role, is_active, is_verified')
    .eq('id', decoded.sub)
    .single();

  if (error || !user) throw Errors.unauthorized('User not found');
  if (!user.is_active) throw Errors.forbidden('Account is deactivated');

  req.user = user;
  next();
});

/**
 * requireRole(...roles) — must come after protect
 */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) {
    throw Errors.forbidden(`Requires role: ${roles.join(' or ')}`);
  }
  next();
};

/**
 * optionalAuth — attaches req.user if token present, never rejects
 */
export const optionalAuth = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return next();
    const decoded = verifyToken(header.split(' ')[1]);
    const { data } = await supabaseAdmin
      .from('users').select('id,email,role').eq('id', decoded.sub).single();
    req.user = data || null;
  } catch { req.user = null; }
  next();
};
