import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import ws from 'ws';

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required Supabase environment variables.');
}

// Public client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: {
    transport: ws, // 👈 FIX
  },
});

// Admin client
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: {
    transport: ws, // 👈 FIX
  },
});