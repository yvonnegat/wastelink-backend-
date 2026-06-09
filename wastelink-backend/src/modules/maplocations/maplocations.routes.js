import { Router } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { protect } from '../../middleware/auth.js';
import { catchAsync, Errors } from '../../utils/errors.js';
import { send } from '../../utils/response.js';

const router = Router();

router.use(protect);

/**
 * Save recycler map location
 */
router.post(
  '/recycler',
  catchAsync(async (req, res) => {
    const {
      name,
      lat,
      lng,
      address,
      city,
      accepted_types,
      operating_hours,
      phone,
      description,
    } = req.body;

    if (!name) {
      throw Errors.badRequest('Business name required');
    }

    if (!lat || !lng) {
      throw Errors.badRequest('Location coordinates required');
    }

    const result = await supabaseAdmin
      .from('map_locations')
      .upsert(
        {
          user_id: req.user.id,
          name,
          location_type: 'recycling_centre',
          lat,
          lng,
          address,
          city,
          accepted_types,
          operating_hours,
          phone,
          description,
          is_active: true,
        },
        {
          onConflict: 'user_id',
        }
      )
      .select()
      .single();

    const { data, error } = result;

    if (error) {
      console.error(error);
      throw new Error(error.message);
    }

    send.ok(res, data);
  })
);

export default router;