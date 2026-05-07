import { Router } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { protect } from '../../middleware/auth.js';
import { catchAsync, Errors } from '../../utils/errors.js';
import { send, parsePagination } from '../../utils/response.js';

const router = Router();
router.use(protect);

// ── GET /notifications ────────────────────────────────────────────
router.get('/', catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const unread_only = req.query.unread === 'true';

  let query = supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (unread_only) query = query.eq('is_read', false);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  send.paginated(res, data, { total: count, page, limit });
}));

// ── GET /notifications/unread-count ──────────────────────────────
router.get('/unread-count', catchAsync(async (req, res) => {
  const { count, error } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .eq('is_read', false);

  if (error) throw new Error(error.message);
  send.ok(res, { count });
}));

// ── PATCH /notifications/:id/read ────────────────────────────────
router.patch('/:id/read', catchAsync(async (req, res) => {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) throw new Error(error.message);
  send.ok(res, { message: 'Marked as read' });
}));

// ── PATCH /notifications/read-all ────────────────────────────────
router.patch('/read-all', catchAsync(async (req, res) => {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', req.user.id)
    .eq('is_read', false);

  if (error) throw new Error(error.message);
  send.ok(res, { message: 'All notifications marked as read' });
}));

// ── DELETE /notifications/:id ─────────────────────────────────────
router.delete('/:id', catchAsync(async (req, res) => {
  const { error } = await supabaseAdmin
    .from('notifications')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) throw new Error(error.message);
  send.noContent(res);
}));

export default router;
