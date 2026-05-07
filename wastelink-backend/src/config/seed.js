import { supabaseAdmin } from './supabase.js';
import { logger } from './logger.js';

async function seed() {
  logger.info('Seeding database…');

  // ── Create demo users via Supabase Auth ──────────────────────────
  const users = [
    { email: 'seller@wastelink.co.ke',   password: 'Demo1234!', full_name: 'Amara Osei',      role: 'seller',   phone: '+254700111222', location: 'Westlands, Nairobi',  lat: -1.2673, lng: 36.8110 },
    { email: 'recycler@wastelink.co.ke', password: 'Demo1234!', full_name: 'James Mwangi',    role: 'recycler', phone: '+254700333444', location: 'Industrial Area, Nairobi', lat: -1.3083, lng: 36.8601 },
    { email: 'admin@wastelink.co.ke',    password: 'Demo1234!', full_name: 'Grace Wanjiku',   role: 'admin',    phone: '+254700555666', location: 'CBD, Nairobi',         lat: -1.2864, lng: 36.8172 },
  ];

  const createdIds = {};
  for (const u of users) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: u.email, password: u.password, email_confirm: true,
      user_metadata: { full_name: u.full_name, role: u.role },
    });
    if (error && !error.message.includes('already registered')) {
      logger.error(`Failed to create ${u.email}: ${error.message}`); continue;
    }
    const uid = data?.user?.id;
    if (!uid) continue;
    createdIds[u.role] = uid;

    await supabaseAdmin.from('users').upsert({
      id: uid, email: u.email, full_name: u.full_name, role: u.role,
      phone: u.phone, location: u.location, lat: u.lat, lng: u.lng,
      is_verified: true, is_active: true,
    });
    logger.info(`  ✓ User: ${u.email}`);
  }

  // ── Recycler profile ──────────────────────────────────────────────
  if (createdIds.recycler) {
    await supabaseAdmin.from('recycler_profiles').upsert({
      user_id: createdIds.recycler,
      business_name: 'GreenCycle Nairobi Ltd',
      license_number: 'NEMA/RC/2024/0042',
      accepted_types: ['Plastic', 'Metal', 'Paper', 'Glass'],
      max_capacity_kg: 5000,
      is_certified: true,
      operating_hours: { mon_fri: '08:00-17:00', sat: '09:00-13:00' },
    });
    logger.info('  ✓ Recycler profile');
  }

  // ── Sample listings ───────────────────────────────────────────────
  if (createdIds.seller) {
    const listings = [
      { seller_id: createdIds.seller, waste_type: 'Plastic', subtype: 'PET Bottles', quantity_kg: 80,  condition: 'clean',  status: 'verified',  price_per_kg: 52, final_price: 4160,  location: 'Westlands', lat: -1.2673, lng: 36.8110 },
      { seller_id: createdIds.seller, waste_type: 'Metal',   subtype: 'Aluminium Cans', quantity_kg: 35, condition: 'clean', status: 'pending_verification', price_per_kg: 175, final_price: 6125, location: 'Westlands', lat: -1.2673, lng: 36.8110 },
      { seller_id: createdIds.seller, waste_type: 'Paper',   subtype: 'Cardboard',   quantity_kg: 120, condition: 'mixed',  status: 'matched',   price_per_kg: 19, final_price: 2280,  location: 'Westlands', lat: -1.2673, lng: 36.8110 },
    ];
    const { data: listingRows } = await supabaseAdmin.from('listings').insert(listings).select();
    logger.info(`  ✓ ${listingRows?.length || 0} listings`);

    // ── Sample transaction ─────────────────────────────────────────
    if (listingRows?.length && createdIds.recycler) {
      await supabaseAdmin.from('transactions').insert({
        listing_id: listingRows[0].id,
        seller_id: createdIds.seller,
        recycler_id: createdIds.recycler,
        waste_type: 'Plastic',
        quantity_kg: 80,
        price_per_kg: 52,
        total_amount: 4160,
        currency: 'KES',
        status: 'completed',
        completed_at: new Date().toISOString(),
      });
      logger.info('  ✓ Sample transaction');
    }
  }

  logger.info('\nSeed complete. Demo credentials:');
  logger.info('  seller@wastelink.co.ke   / Demo1234!');
  logger.info('  recycler@wastelink.co.ke / Demo1234!');
  logger.info('  admin@wastelink.co.ke    / Demo1234!');
}

seed().catch(e => { logger.error(e.message); process.exit(1); });
