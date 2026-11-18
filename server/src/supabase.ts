import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

let admin: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service-role key. Bypasses Row Level Security,
 * so it must only ever run on the server. Never send this key to the browser.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      throw new Error(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Start Supabase (`npm run db:start`) then run `npm run db:env`.',
      );
    }
    admin = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
