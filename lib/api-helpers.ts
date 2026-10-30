// Small helpers shared by the API routes. SERVER ONLY.
import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { ConfigError } from './supabase-server';

export function fail(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}

// The database provider sits behind a web firewall. When it dislikes a request (for example text
// that looks like an SQL attack) it answers with an HTML page instead of data.
function isBlockedByFirewall(err: unknown): boolean {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && /^\s*<(!doctype|html)/i.test(message);
}

// Turns any error into a friendly JSON answer. Technical details go to the server log only.
export function handleError(err: unknown, what: string) {
  unstable_rethrow(err); // Next.js uses special errors internally; they must not be swallowed here
  if (err instanceof ConfigError) return fail(503, err.message);
  if (isBlockedByFirewall(err)) {
    console.warn(`[${what}] request refused by the database firewall`);
    return fail(400, 'That text cannot be used here. Please remove special characters and try again.');
  }
  console.error(`[${what}]`, err);
  return fail(500, 'Something went wrong. Please try again.');
}

// Reads the optional ?q= text for a search. Only letters, digits, spaces and a few harmless
// marks are kept. Everything else (quotes, brackets, semicolons, "=", "%", "*" ...) either has a
// special meaning in the database filter language or is only used in attacks, and a real vendor
// name or invoice number never needs it.
export function cleanSearch(text: string | null): string {
  return (text ?? '')
    .replace(/[^\p{L}\p{N}\s\-_/.&#]/gu, ' ')
    .replace(/-{2,}/g, '-') // "--" starts a comment in SQL
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
