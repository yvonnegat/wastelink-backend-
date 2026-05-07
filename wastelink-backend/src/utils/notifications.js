import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';

/**
 * Create a notification row. Extend this to trigger push/email.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {'match_found'|'listing_verified'|'transaction_update'|'price_alert'|'system'} opts.type
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {object} [opts.data]
 */
export async function createNotification({ userId, type, title, body, data = {} }) {
  const { error } = await supabaseAdmin.from('notifications').insert({
    user_id: userId, type, title, body, data,
  });
  if (error) logger.error('createNotification failed', { error: error.message });

  // TODO: integrate FCM / OneSignal / Supabase Realtime broadcast here
}

export const NotifTemplates = {
  matchFound: (recyclerName, wasteType) => ({
    type: 'match_found',
    title: 'Recycler Match Found 🎉',
    body:  `${recyclerName} wants to collect your ${wasteType} listing.`,
  }),
  listingVerified: (wasteType) => ({
    type: 'listing_verified',
    title: 'Listing Verified ✓',
    body:  `Your ${wasteType} listing has been verified and is now live.`,
  }),
  transactionUpdate: (status, amount) => ({
    type: 'transaction_update',
    title: `Transaction ${status}`,
    body:  `Your transaction of KES ${Number(amount).toLocaleString()} is now ${status}.`,
  }),
  priceAlert: (wasteType, newRate) => ({
    type: 'price_alert',
    title: 'Price Update',
    body:  `${wasteType} rates have changed. New rate: KES ${newRate}/kg.`,
  }),
};
