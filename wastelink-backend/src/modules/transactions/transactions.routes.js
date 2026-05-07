import { Router } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { catchAsync, Errors } from '../../utils/errors.js';
import { send, parsePagination } from '../../utils/response.js';
import { createNotification, NotifTemplates } from '../../utils/notifications.js';
import { UpdateTransactionSchema, CreateRatingSchema } from '../../utils/schemas.js';

const router = Router();
router.use(protect);

// ── GET /transactions ─────────────────────────────────────────────
router.get('/', catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { status } = req.query;
  const uid = req.user.id;

  let query = supabaseAdmin
    .from('transactions')
    .select(`
      *,
      listing:listings (id, waste_type, subtype, quantity_kg, listing_images(url, is_primary)),
      seller:users!seller_id   (id, full_name, avatar_url, location),
      recycler:users!recycler_id (id, full_name, avatar_url, location)
    `, { count: 'exact' })
    .or(`seller_id.eq.${uid},recycler_id.eq.${uid}`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  send.paginated(res, data, { total: count, page, limit });
}));

// ── GET /transactions/:id ─────────────────────────────────────────
router.get('/:id', catchAsync(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select(`
      *,
      listing:listings (*, listing_images(*)),
      seller:users!seller_id   (*),
      recycler:users!recycler_id (*),
      ratings (*)
    `)
    .eq('id', req.params.id)
    .single();

  if (error || !data) throw Errors.notFound('Transaction');

  const isParty = [data.seller_id, data.recycler_id].includes(req.user.id);
  if (!isParty && req.user.role !== 'admin') throw Errors.forbidden();

  send.ok(res, data);
}));

// ── PATCH /transactions/:id — update status ───────────────────────
router.patch('/:id', validate(UpdateTransactionSchema), catchAsync(async (req, res) => {
  const { status, payment_method, payment_ref, notes } = req.body;

  const { data: tx } = await supabaseAdmin
    .from('transactions').select('*').eq('id', req.params.id).single();

  if (!tx) throw Errors.notFound('Transaction');

  const isParty = [tx.seller_id, tx.recycler_id].includes(req.user.id);
  if (!isParty) throw Errors.forbidden();

  // Validate status machine transitions
  const allowed = allowedTransitions(tx.status, req.user.role === 'recycler' ? 'recycler' : 'seller');
  if (!allowed.includes(status)) {
    throw Errors.badRequest(`Cannot transition from '${tx.status}' to '${status}'`);
  }

  const updates = {
    status,
    payment_method: payment_method ?? tx.payment_method,
    payment_ref:    payment_ref    ?? tx.payment_ref,
    notes:          notes          ?? tx.notes,
    updated_at:     new Date().toISOString(),
  };

  if (status === 'completed') {
    updates.completed_at = new Date().toISOString();

    // Mark listing as completed
    await supabaseAdmin
      .from('listings')
      .update({ status: 'completed' })
      .eq('id', tx.listing_id);
  }

  if (status === 'confirmed') {
    updates.collected_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Notify the other party
  const recipientId = req.user.id === tx.seller_id ? tx.recycler_id : tx.seller_id;
  await createNotification({
    userId: recipientId,
    ...NotifTemplates.transactionUpdate(status, tx.total_amount),
    data:   { transaction_id: tx.id },
  });

  send.ok(res, data);
}));

// ── POST /transactions/:id/rate ───────────────────────────────────
router.post('/:id/rate', validate(CreateRatingSchema), catchAsync(async (req, res) => {
  const { ratee_id, score, comment } = req.body;

  const { data: tx } = await supabaseAdmin
    .from('transactions').select('*').eq('id', req.params.id).single();

  if (!tx) throw Errors.notFound('Transaction');
  if (tx.status !== 'completed') throw Errors.badRequest('Can only rate completed transactions');

  const isParty = [tx.seller_id, tx.recycler_id].includes(req.user.id);
  if (!isParty) throw Errors.forbidden();

  // ratee must be the other party
  const otherParty = req.user.id === tx.seller_id ? tx.recycler_id : tx.seller_id;
  if (ratee_id !== otherParty) throw Errors.badRequest('Invalid ratee for this transaction');

  const { data, error } = await supabaseAdmin
    .from('ratings')
    .insert({ transaction_id: req.params.id, rater_id: req.user.id, ratee_id, score, comment })
    .select()
    .single();

  if (error?.code === '23505') throw Errors.conflict('You have already rated this transaction');
  if (error) throw new Error(error.message);

  send.created(res, data);
}));

// ── GET /transactions/summary/stats ──────────────────────────────
router.get('/summary/stats', catchAsync(async (req, res) => {
  const uid = req.user.id;

  const { data: txData } = await supabaseAdmin
    .from('transactions')
    .select('status, total_amount, quantity_kg')
    .or(`seller_id.eq.${uid},recycler_id.eq.${uid}`);

  const stats = {
    total:           txData?.length || 0,
    completed:       txData?.filter(t => t.status === 'completed').length || 0,
    pending:         txData?.filter(t => ['initiated','pending','confirmed'].includes(t.status)).length || 0,
    totalValue:      txData?.filter(t => t.status === 'completed')
                           .reduce((s, t) => s + Number(t.total_amount), 0) || 0,
    totalVolume:     txData?.filter(t => t.status === 'completed')
                           .reduce((s, t) => s + Number(t.quantity_kg), 0) || 0,
  };

  send.ok(res, stats);
}));

// ── Status machine ────────────────────────────────────────────────
function allowedTransitions(current, actorRole) {
  const machine = {
    initiated: { recycler: ['confirmed', 'cancelled'], seller: ['cancelled'] },
    pending:   { recycler: ['confirmed', 'cancelled'], seller: ['cancelled'] },
    confirmed: { recycler: ['completed'],              seller: ['disputed'] },
    completed: { recycler: [],                         seller: [] },
    disputed:  { recycler: ['completed'],              seller: [] },
    cancelled: { recycler: [],                         seller: [] },
  };
  return machine[current]?.[actorRole] || [];
}

export default router;
