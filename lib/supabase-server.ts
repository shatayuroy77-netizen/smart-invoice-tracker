// The database connection. SERVER ONLY.
// It uses the SECRET service key, which can read and write everything, so this file must never
// be imported from a page or component that runs in the browser ('server-only' enforces that).
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const PHOTO_BUCKET = 'invoice-photos';

let client: SupabaseClient | null = null;

export class ConfigError extends Error {}

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ConfigError('The database is not connected yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the server.');
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

// Today's date in India as YYYY-MM-DD (the server clock is in UTC).
export function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
