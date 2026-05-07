import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { supabaseAdmin } from './supabase.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  logger.info('Running database migrations…');
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

  // Split on statement boundaries and run each
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);

  let ok = 0;
  for (const stmt of statements) {
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql: stmt + ';' });
    if (error) {
      logger.warn(`Migration stmt skipped (may already exist): ${error.message}`);
    } else {
      ok++;
    }
  }
  logger.info(`Migration complete — ${ok}/${statements.length} statements applied.`);
}

migrate().catch(e => { logger.error(e.message); process.exit(1); });
