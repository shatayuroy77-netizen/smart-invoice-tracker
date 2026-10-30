// POST /api/scan
// Receives ONE invoice photo, asks Gemini to read it, double-checks the answer, and returns it.
// Nothing is saved here: the staff member checks the fields first and presses Save (a later phase).
import type { NextRequest } from 'next/server';
import { extractInvoiceFromImage, GeminiError } from '@/lib/gemini';
import { checkInvoice } from '@/lib/invoice-checks';
import { sniffImageType } from '@/lib/image-type';

// (This project's Next.js uses the Node.js runtime by default, so no "runtime" setting is needed.)
export const maxDuration = 60; // seconds; reading an invoice usually takes 5-15

// Vercel rejects request bodies above 4.5 MB, so we stop at 4 MB. The Scan screen shrinks
// phone photos before uploading, so real photos stay far below this.
const MAX_BYTES = 4 * 1024 * 1024;

// A very small "no more than 12 scans per minute per visitor" limit. It lives in memory, so it
// is a speed bump for accidents and abuse, not real security. (There is no login in this app.)
const hits = new Map<string, number[]>();
function tooManyRequests(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 12;
}

function fail(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (tooManyRequests(ip)) return fail(429, 'Too many scans in a minute. Please wait a little.');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'Send the photo as form data with the field name "image".');
  }

  const file = form.get('image');
  if (!(file instanceof File)) return fail(400, 'No photo received. Send the photo in a form field named "image".');
  if (file.size === 0) return fail(400, 'The photo is empty.');
  if (file.size > MAX_BYTES) return fail(413, 'The photo is larger than 4 MB. Please use a smaller photo.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffImageType(bytes)?.mime;
  if (!mimeType) return fail(415, 'This is not a photo we can read. Please use a JPEG, PNG, WebP or HEIC image.');

  try {
    const raw = await extractInvoiceFromImage({ base64: Buffer.from(bytes).toString('base64'), mimeType });
    const { invoice, warnings } = checkInvoice(raw);
    return Response.json({
      ok: true,
      invoice,
      warnings,
      // true when staff MUST fix something before saving
      has_errors: warnings.some((w) => w.severity === 'error'),
    });
  } catch (err) {
    if (err instanceof GeminiError) return fail(err.status, err.message);
    console.error('[scan] Unexpected error:', err);
    return fail(500, 'Something went wrong while reading the invoice.');
  }
}
