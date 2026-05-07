import { Router } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { protect, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/auditLog.js';
import { catchAsync, Errors } from '../../utils/errors.js';
import { send, parsePagination } from '../../utils/response.js';
import { createNotification, NotifTemplates } from '../../utils/notifications.js';
import { AdminUpdateUserSchema } from '../../utils/schemas.js';

const router = Router();
router.use(protect, requireRole('admin'));

// ══ DASHBOARD STATS ══════════════════════════════════════════════

router.get('/stats', catchAsync(async (_req, res) => {
  const [users, listings, transactions, revenue] = await Promise.all([
    supabaseAdmin.from('users').select('role', { count: 'exact', head: false }),
    supabaseAdmin.from('listings').select('status', { count: 'exact', head: false }),
    supabaseAdmin.from('transactions').select('status, total_amount'),
    supabaseAdmin.from('transactions')
      .select('total_amount')
      .eq('status', 'completed'),
  ]);

  const totalRevenue = revenue.data?.reduce((s, t) => s + Number(t.total_amount), 0) || 0;

  const roleBreakdown = (users.data || []).reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1; return acc;
  }, {});

  const statusBreakdown = (listings.data || []).reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1; return acc;
  }, {});

  send.ok(res, {
    users:        { total: users.count, ...roleBreakdown },
    listings:     { total: listings.count, ...statusBreakdown },
    transactions: { total: transactions.count },
    revenue:      { total: totalRevenue, currency: 'KES' },
  });
}));

// ══ USERS ════════════════════════════════════════════════════════

router.get('/users', catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { role, is_verified, is_active, search } = req.query;

  let query = supabaseAdmin
    .from('users')
    .select('*, recycler_profiles(business_name, is_certified)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (role)        query = query.eq('role', role);
  if (is_verified !== undefined) query = query.eq('is_verified', is_verified === 'true');
  if (is_active   !== undefined) query = query.eq('is_active',   is_active   === 'true');
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  send.paginated(res, data, { total: count, page, limit });
}));

router.get('/users/:id', catchAsync(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*, recycler_profiles(*)')
    .eq('id', req.params.id)
    .single();

  if (error || !data) throw Errors.notFound('User');
  send.ok(res, data);
}));

router.patch('/users/:id',
  validate(AdminUpdateUserSchema),
  auditLog('UPDATE_USER', 'users'),
  catchAsync(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) throw Errors.notFound('User');
    send.ok(res, data);
  }),
);

router.delete('/users/:id',
  auditLog('DELETE_USER', 'users'),
  catchAsync(async (req, res) => {
    // Deactivate instead of hard delete to preserve history
    await supabaseAdmin
      .from('users')
      .update({ is_active: false })
      .eq('id', req.params.id);

    await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    send.noContent(res);
  }),
);

// ══ LISTINGS ═════════════════════════════════════════════════════

router.get('/listings', catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { status, waste_type } = req.query;

  let query = supabaseAdmin
    .from('listings')
    .select(`
      *, 
      seller:users!seller_id (id, full_name, email),
      listing_images (url, is_primary)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status)     query = query.eq('status', status);
  if (waste_type) query = query.eq('waste_type', waste_type);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  send.paginated(res, data, { total: count, page, limit });
}));

// Admin verifies a listing (sets status → verified and populates vision fields)
router.patch('/listings/:id/verify',
  auditLog('VERIFY_LISTING', 'listings'),
  catchAsync(async (req, res) => {
    const {
      vision_confidence, vision_quality, vision_consistency,
      vision_verdict = 'verified', vision_notes,
    } = req.body;

    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .update({
        status: 'verified',
        vision_confidence, vision_quality, vision_consistency,
        vision_verdict, vision_notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !listing) throw Errors.notFound('Listing');

    await createNotification({
      userId: listing.seller_id,
      ...NotifTemplates.listingVerified(listing.waste_type),
      data: { listing_id: listing.id },
    });

    send.ok(res, listing);
  }),
);

router.delete('/listings/:id',
  auditLog('DELETE_LISTING', 'listings'),
  catchAsync(async (req, res) => {
    const { error } = await supabaseAdmin
      .from('listings').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    send.noContent(res);
  }),
);

// ══ TRANSACTIONS ══════════════════════════════════════════════════

router.get('/transactions', catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { status } = req.query;

  let query = supabaseAdmin
    .from('transactions')
    .select(`
      *,
      seller:users!seller_id   (id, full_name, email),
      recycler:users!recycler_id (id, full_name, email)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  send.paginated(res, data, { total: count, page, limit });
}));

// ══ AUDIT LOG ═════════════════════════════════════════════════════

router.get('/audit-logs', catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);

  const { data, error, count } = await supabaseAdmin
    .from('audit_logs')
    .select('*, actor:users!actor_id(id, full_name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  send.paginated(res, data, { total: count, page, limit });
}));

// ══ BROADCAST NOTIFICATION ════════════════════════════════════════

router.post('/notify-all', catchAsync(async (req, res) => {
  const { title, body, type = 'system', role } = req.body;
  if (!title || !body) throw Errors.badRequest('title and body are required');

  let query = supabaseAdmin.from('users').select('id').eq('is_active', true);
  if (role) query = query.eq('role', role);

  const { data: users } = await query;
  if (!users?.length) return send.ok(res, { sent: 0 });

  const rows = users.map(u => ({ user_id: u.id, type, title, body }));
  await supabaseAdmin.from('notifications').insert(rows);

  send.ok(res, { sent: rows.length });
}));

export default router;
