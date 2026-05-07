import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────────────────
export const RegisterSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2).max(100),
  phone:     z.string().optional(),
  role:      z.enum(['seller', 'recycler']),
  location:  z.string().optional(),
  lat:       z.number().optional(),
  lng:       z.number().optional(),
});

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ── Users ─────────────────────────────────────────────────────────
export const UpdateProfileSchema = z.object({
  full_name: z.string().min(2).max(100).optional(),
  phone:     z.string().optional(),
  location:  z.string().optional(),
  lat:       z.number().optional(),
  lng:       z.number().optional(),
  metadata:  z.record(z.unknown()).optional(),
});

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password:     z.string().min(8),
});

// ── Listings ──────────────────────────────────────────────────────
export const CreateListingSchema = z.object({
  waste_type:  z.enum(['Plastic', 'Paper', 'Metal', 'Glass', 'Organic', 'E-Waste']),
  subtype:     z.string().min(1).max(100),
  quantity_kg: z.number().positive().max(10000),
  condition:   z.enum(['clean', 'mixed', 'contaminated']).default('clean'),
  description: z.string().max(1000).optional(),
  location:    z.string().optional(),
  lat:         z.number().optional(),
  lng:         z.number().optional(),
});

export const UpdateListingSchema = CreateListingSchema.partial();

export const AcceptPriceSchema = z.object({
  price_per_kg:       z.number().positive(),
  base_price:         z.number().positive(),
  quality_adjustment: z.number(),
  volume_adjustment:  z.number(),
  final_price:        z.number().positive(),
});

// ── Recycler Profiles ─────────────────────────────────────────────
export const RecyclerProfileSchema = z.object({
  business_name:    z.string().min(2).max(200),
  license_number:   z.string().optional(),
  accepted_types:   z.array(z.enum(['Plastic', 'Paper', 'Metal', 'Glass', 'Organic', 'E-Waste'])).min(1),
  max_capacity_kg:  z.number().positive().optional(),
  operating_hours:  z.record(z.string()).optional(),
  certification_url: z.string().url().optional(),
});

// ── Matches ───────────────────────────────────────────────────────
export const RespondMatchSchema = z.object({
  status:  z.enum(['accepted', 'rejected']),
  message: z.string().max(500).optional(),
});

// ── Transactions ──────────────────────────────────────────────────
export const UpdateTransactionSchema = z.object({
  status:         z.enum(['confirmed', 'completed', 'disputed', 'cancelled']),
  payment_method: z.string().optional(),
  payment_ref:    z.string().optional(),
  notes:          z.string().max(500).optional(),
});

// ── Ratings ───────────────────────────────────────────────────────
export const CreateRatingSchema = z.object({
  ratee_id: z.string().uuid(),
  score:    z.number().int().min(1).max(5),
  comment:  z.string().max(500).optional(),
});

// ── Admin ─────────────────────────────────────────────────────────
export const AdminUpdateUserSchema = z.object({
  is_verified: z.boolean().optional(),
  is_active:   z.boolean().optional(),
  role:        z.enum(['seller', 'recycler', 'admin']).optional(),
});
