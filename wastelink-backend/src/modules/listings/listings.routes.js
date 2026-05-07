import { Router } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { protect, requireRole, optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { upload, uploadToSupabase, deleteFromSupabase } from '../../middleware/upload.js';
import { catchAsync, Errors } from '../../utils/errors.js';
import { send, parsePagination } from '../../utils/response.js';
import { createNotification, NotifTemplates } from '../../utils/notifications.js';
import {
  CreateListingSchema,
  UpdateListingSchema,
  AcceptPriceSchema,
} from '../../utils/schemas.js';

const router = Router();

// ── GET /listings — public feed ───────────────────────────────────
router.get('/', optionalAuth, catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { waste_type, status, condition, min_qty, max_qty, sort = 'created_at' } = req.query;

  let query = supabaseAdmin
    .from('listings')
    .select(`
      *,
      seller:users!seller_id (id, full_name, rating, avatar_url, location),
      listing_images (url, is_primary)
    `, { count: 'exact' })
    .neq('status', 'draft')
    .order(sort, { ascending: false })
    .range(offset, offset + limit - 1);

  if (waste_type) query = query.eq('waste_type', waste_type);
  if (status)     query = query.eq('status', status);
  if (condition)  query = query.eq('condition', condition);
  if (min_qty)    query = query.gte('quantity_kg', parseFloat(min_qty));
  if (max_qty)    query = query.lte('quantity_kg', parseFloat(max_qty));

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  send.paginated(res, data, { total: count, page, limit });
}));

// ── GET /listings/my — seller's own listings ─────────────────────
router.get('/my', protect, catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);

  const { data, error, count } = await supabaseAdmin
    .from('listings')
    .select('*, listing_images(url, is_primary)', { count: 'exact' })
    .eq('seller_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  send.paginated(res, data, { total: count, page, limit });
}));

// ── GET /listings/:id ─────────────────────────────────────────────
router.get('/:id', optionalAuth, catchAsync(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select(`
      *,
      seller:users!seller_id (id, full_name, rating, rating_count, avatar_url, location, phone),
      listing_images (*),
      matches (id, status, recycler_id, created_at)
    `)
    .eq('id', req.params.id)
    .single();

  if (error || !data) throw Errors.notFound('Listing');

  // Hide draft from non-owners
  if (data.status === 'draft' && data.seller_id !== req.user?.id) {
    throw Errors.notFound('Listing');
  }
  send.ok(res, data);
}));

// ── POST /listings — create ───────────────────────────────────────
router.post('/', protect, requireRole('seller'), validate(CreateListingSchema),
  catchAsync(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('listings')
      .insert({ ...req.body, seller_id: req.user.id, status: 'draft' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    send.created(res, data);
  }),
);

// ── PATCH /listings/:id — update ─────────────────────────────────
router.patch('/:id', protect, requireRole('seller'), validate(UpdateListingSchema),
  catchAsync(async (req, res) => {
    await assertOwner(req.params.id, req.user.id);

    const { data, error } = await supabaseAdmin
      .from('listings')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('seller_id', req.user.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    send.ok(res, data);
  }),
);

// ── DELETE /listings/:id ──────────────────────────────────────────
router.delete('/:id', protect, requireRole('seller'), catchAsync(async (req, res) => {
  await assertOwner(req.params.id, req.user.id);

  // Delete images from storage first
  const { data: images } = await supabaseAdmin
    .from('listing_images')
    .select('storage_path')
    .eq('listing_id', req.params.id);

  for (const img of images || []) {
    await deleteFromSupabase(img.storage_path).catch(() => {});
  }

  const { error } = await supabaseAdmin
    .from('listings')
    .delete()
    .eq('id', req.params.id)
    .eq('seller_id', req.user.id);

  if (error) throw new Error(error.message);
  send.noContent(res);
}));

// ── POST /listings/:id/images ─────────────────────────────────────
router.post('/:id/images', protect, requireRole('seller'),
  upload.array('images', 5), catchAsync(async (req, res) => {
    await assertOwner(req.params.id, req.user.id);
    if (!req.files?.length) throw Errors.badRequest('No files uploaded');

    const existing = await supabaseAdmin
      .from('listing_images').select('id').eq('listing_id', req.params.id);
    const isPrimary = (existing.data?.length || 0) === 0;

    const rows = [];
    for (const [i, file] of req.files.entries()) {
      const { url, path } = await uploadToSupabase(
        file.buffer, file.mimetype, `listings/${req.params.id}`,
      );
      rows.push({
        listing_id: req.params.id,
        url, storage_path: path,
        is_primary: isPrimary && i === 0,
      });
    }

    const { data, error } = await supabaseAdmin
      .from('listing_images').insert(rows).select();
    if (error) throw new Error(error.message);

    // Advance status to pending_verification once images are uploaded
    await supabaseAdmin
      .from('listings')
      .update({ status: 'pending_verification' })
      .eq('id', req.params.id)
      .eq('status', 'draft');

    send.created(res, data);
  }),
);

// ── DELETE /listings/:id/images/:imageId ──────────────────────────
router.delete('/:id/images/:imageId', protect, requireRole('seller'),
  catchAsync(async (req, res) => {
    await assertOwner(req.params.id, req.user.id);

    const { data: img } = await supabaseAdmin
      .from('listing_images')
      .select('storage_path')
      .eq('id', req.params.imageId)
      .eq('listing_id', req.params.id)
      .single();

    if (!img) throw Errors.notFound('Image');
    await deleteFromSupabase(img.storage_path);

    await supabaseAdmin.from('listing_images').delete().eq('id', req.params.imageId);
    send.noContent(res);
  }),
);

// ── POST /listings/:id/accept-price ──────────────────────────────
router.post('/:id/accept-price', protect, requireRole('seller'), validate(AcceptPriceSchema),
  catchAsync(async (req, res) => {
    await assertOwner(req.params.id, req.user.id);

    const { data, error } = await supabaseAdmin
      .from('listings')
      .update({
        ...req.body,
        price_accepted:    true,
        price_accepted_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('seller_id', req.user.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    send.ok(res, data);
  }),
);

// ── POST /listings/:id/submit ─ move draft → pending_verification ─
router.post('/:id/submit', protect, requireRole('seller'), catchAsync(async (req, res) => {
  const listing = await assertOwner(req.params.id, req.user.id);
  if (listing.status !== 'draft') throw Errors.badRequest('Only draft listings can be submitted');

  const { data, error } = await supabaseAdmin
    .from('listings')
    .update({ status: 'pending_verification' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  send.ok(res, data);
}));

// ── Helper ────────────────────────────────────────────────────────
async function assertOwner(listingId, userId) {
  const { data, error } = await supabaseAdmin
    .from('listings').select('id, seller_id, status').eq('id', listingId).single();
  if (error || !data) throw Errors.notFound('Listing');
  if (data.seller_id !== userId) throw Errors.forbidden('You do not own this listing');
  return data;
}

export default router;
