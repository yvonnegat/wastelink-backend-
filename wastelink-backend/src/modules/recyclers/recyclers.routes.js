import { Router } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { protect, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { catchAsync, Errors } from '../../utils/errors.js';
import { send, parsePagination } from '../../utils/response.js';
import { createNotification, NotifTemplates } from '../../utils/notifications.js';
import { RespondMatchSchema } from '../../utils/schemas.js';

const router = Router();

// ── GET /recyclers — browse all recyclers ─────────────────────────
router.get('/', catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { waste_type, certified, search } = req.query;

  let query = supabaseAdmin
    .from('users')
    .select(`
      id, full_name, location, lat, lng, rating, rating_count,
      avatar_url, is_verified, created_at,
      recycler_profiles (
        business_name, accepted_types, max_capacity_kg,
        is_certified, operating_hours
      )
    `, { count: 'exact' })
    .eq('role', 'recycler')
    .eq('is_active', true)
    .not('recycler_profiles', 'is', null)
    .order('rating', { ascending: false })
    .range(offset, offset + limit - 1);

  if (waste_type) {
    query = query.contains('recycler_profiles.accepted_types', [waste_type]);
  }
  if (certified === 'true') {
    query = query.eq('recycler_profiles.is_certified', true);
  }
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,location.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  send.paginated(res, data, { total: count, page, limit });
}));

// ── GET /recyclers/:id ────────────────────────────────────────────
router.get('/:id', catchAsync(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(`
      id, full_name, location, lat, lng, rating, rating_count,
      avatar_url, is_verified, created_at,
      recycler_profiles (*)
    `)
    .eq('id', req.params.id)
    .eq('role', 'recycler')
    .single();

  if (error || !data) throw Errors.notFound('Recycler');
  send.ok(res, data);
}));

// ── POST /recyclers/listings/:listingId/request-match ─────────────
// Recycler expresses interest in a listing
router.post('/listings/:listingId/request-match', protect, requireRole('recycler'),
  catchAsync(async (req, res) => {
    // Verify listing exists and is matchable
    const { data: listing, error: listErr } = await supabaseAdmin
      .from('listings')
      .select('id, seller_id, waste_type, status, recycler_profiles:users!seller_id(recycler_profiles(accepted_types))')
      .eq('id', req.params.listingId)
      .single();

    if (listErr || !listing) throw Errors.notFound('Listing');
    if (!['verified', 'matched'].includes(listing.status)) {
      throw Errors.badRequest('This listing is not available for matching');
    }

    // Check recycler accepts this waste type
    const { data: profile } = await supabaseAdmin
      .from('recycler_profiles')
      .select('accepted_types')
      .eq('user_id', req.user.id)
      .single();

    if (!profile) throw Errors.badRequest('Complete your recycler profile first');

    // Check no existing active match
    const { data: existing } = await supabaseAdmin
      .from('matches')
      .select('id, status')
      .eq('listing_id', req.params.listingId)
      .eq('recycler_id', req.user.id)
      .in('status', ['proposed', 'accepted'])
      .maybeSingle();

    if (existing) throw Errors.conflict('You have already requested this listing');

    const { data: match, error } = await supabaseAdmin
      .from('matches')
      .insert({
        listing_id:  req.params.listingId,
        recycler_id: req.user.id,
        seller_id:   listing.seller_id,
        status:      'proposed',
        message:     req.body?.message || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Notify seller
    await createNotification({
      userId: listing.seller_id,
      ...NotifTemplates.matchFound(req.user.full_name, listing.waste_type),
      data:   { match_id: match.id, listing_id: listing.id },
    });

    // Advance listing status
    await supabaseAdmin
      .from('listings')
      .update({ status: 'matched' })
      .eq('id', req.params.listingId)
      .eq('status', 'verified');

    send.created(res, match);
  }),
);

// ── GET /recyclers/matches/incoming — recycler sees their proposals ─
router.get('/matches/incoming', protect, requireRole('recycler'), catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);

  const { data, error, count } = await supabaseAdmin
    .from('matches')
    .select(`
      *, 
      listing:listings (*, listing_images(url, is_primary)),
      seller:users!seller_id (id, full_name, location, rating, avatar_url)
    `, { count: 'exact' })
    .eq('recycler_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  send.paginated(res, data, { total: count, page, limit });
}));

// ── GET /recyclers/matches/outgoing — seller sees match proposals on their listings ─
router.get('/matches/outgoing', protect, requireRole('seller'), catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);

  const { data, error, count } = await supabaseAdmin
    .from('matches')
    .select(`
      *,
      recycler:users!recycler_id (id, full_name, location, rating, avatar_url, recycler_profiles(*)),
      listing:listings (id, waste_type, quantity_kg, status)
    `, { count: 'exact' })
    .eq('seller_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  send.paginated(res, data, { total: count, page, limit });
}));

// ── PATCH /recyclers/matches/:matchId/respond — seller accepts/rejects ─
router.patch('/matches/:matchId/respond', protect, requireRole('seller'),
  validate(RespondMatchSchema), catchAsync(async (req, res) => {
    const { status, message } = req.body;

    const { data: match } = await supabaseAdmin
      .from('matches').select('*').eq('id', req.params.matchId).single();

    if (!match) throw Errors.notFound('Match');
    if (match.seller_id !== req.user.id) throw Errors.forbidden();
    if (match.status !== 'proposed') throw Errors.badRequest('Match already responded to');

    const { data: updated, error } = await supabaseAdmin
      .from('matches')
      .update({ status, message, responded_at: new Date().toISOString() })
      .eq('id', req.params.matchId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // If accepted → create transaction
    if (status === 'accepted') {
      const { data: listing } = await supabaseAdmin
        .from('listings').select('*').eq('id', match.listing_id).single();

      await supabaseAdmin.from('transactions').insert({
        listing_id:  match.listing_id,
        match_id:    match.id,
        seller_id:   match.seller_id,
        recycler_id: match.recycler_id,
        waste_type:  listing.waste_type,
        quantity_kg: listing.quantity_kg,
        price_per_kg: listing.price_per_kg || 0,
        total_amount: listing.final_price  || 0,
        currency:    'KES',
        status:      'initiated',
      });

      // Notify recycler
      await createNotification({
        userId: match.recycler_id,
        type:   'match_found',
        title:  'Match Accepted! 🎉',
        body:   `The seller has accepted your collection request.`,
        data:   { match_id: match.id },
      });
    }

    send.ok(res, updated);
  }),
);

export default router;
