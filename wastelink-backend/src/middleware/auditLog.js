import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';

/**
 * auditLog(action, resource) — logs admin/sensitive actions to audit_logs table.
 * Attach after the route handler has completed.
 */
export const auditLog = (action, resource) => async (req, res, next) => {
  res.on('finish', async () => {
    if (res.statusCode >= 400) return; // only log successful actions
    try {
      await supabaseAdmin.from('audit_logs').insert({
        actor_id:    req.user?.id,
        action,
        resource,
        resource_id: req.params?.id || null,
        new_data:    req.body || null,
        ip_address:  req.ip,
      });
    } catch (err) {
      logger.warn('auditLog insert failed', { message: err.message });
    }
  });
  next();
};
