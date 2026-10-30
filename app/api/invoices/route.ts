// GET  /api/invoices   -> the invoice list (search + filters), from the v_invoice_list view
// POST /api/invoices   -> save a checked invoice (and its photo) with the save_invoice() database function
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { cleanSearch, fail, handleError } from '@/lib/api-helpers';
import { sniffImageType } from '@/lib/image-type';
import { SaveInvoiceSchema } from '@/lib/save-schema';
import { db, PHOTO_BUCKET } from '@/lib/supabase-server';

export const maxDuration = 30;

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const q = cleanSearch(params.get('q'));
    const status = params.get('status') ?? 'all';

    let query = db()
      .from('v_invoice_list')
      .select('*')
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);

    if (q) query = query.or(`vendor_name.ilike.%${q}%,invoice_number.ilike.%${q}%`);
    if (status === 'paid') query = query.eq('payment_status', 'paid');
    if (status === 'unpaid') query = query.eq('payment_status', 'unpaid');
    if (status === 'overdue') query = query.eq('status_label', 'Overdue');
    if (params.get('flagged') === '1') query = query.gt('flag_count', 0);

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ ok: true, invoices: data });
  } catch (err) {
    return handleError(err, 'invoices:list');
  }
}

export async function POST(request: NextRequest) {
  let uploadedPath: string | null = null;
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail(400, 'Send the invoice as form data.');
    }

    // 1) check the invoice fields
    let json: unknown;
    try {
      json = JSON.parse(String(form.get('data') ?? ''));
    } catch {
      return fail(400, 'The invoice data is missing or broken.');
    }
    const parsed = SaveInvoiceSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return fail(400, `${first.path.join('.') || 'Invoice'}: ${first.message}`);
    }

    // 2) store the photo (optional)
    const file = form.get('image');
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PHOTO_BYTES) return fail(413, 'The photo is larger than 4 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = sniffImageType(bytes);
      if (!type) return fail(415, 'The photo must be a JPEG, PNG, WebP or HEIC image.');
      const now = new Date();
      const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${type.ext}`;
      const { error: uploadError } = await db().storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: type.mime });
      if (uploadError) throw uploadError;
      uploadedPath = path;
    }

    // 3) save everything in one go (the database function)
    const { data, error } = await db().rpc('save_invoice', { p: { ...parsed.data, image_path: uploadedPath } });
    if (error) {
      // a rule of the database was broken (for example a due date before the invoice date)
      console.error('[invoices:save]', error.message);
      if (uploadedPath) await db().storage.from(PHOTO_BUCKET).remove([uploadedPath]);
      return fail(400, `The invoice could not be saved: ${error.message}`);
    }

    // Looks like a duplicate and staff has not confirmed: nothing was saved, so remove the photo again.
    if (!data?.saved && uploadedPath) await db().storage.from(PHOTO_BUCKET).remove([uploadedPath]);

    return Response.json({ ok: true, ...data });
  } catch (err) {
    if (uploadedPath) await db().storage.from(PHOTO_BUCKET).remove([uploadedPath]).catch(() => undefined);
    return handleError(err, 'invoices:save');
  }
}
