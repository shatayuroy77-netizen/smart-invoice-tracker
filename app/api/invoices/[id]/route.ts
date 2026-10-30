// GET /api/invoices/:id -> one invoice with its item lines, its flags and a temporary photo link
import type { NextRequest } from 'next/server';
import { fail, handleError, UUID_PATTERN } from '@/lib/api-helpers';
import { db, PHOTO_BUCKET } from '@/lib/supabase-server';

export async function GET(_request: NextRequest, ctx: RouteContext<'/api/invoices/[id]'>) {
  try {
    const { id } = await ctx.params;
    if (!UUID_PATTERN.test(id)) return fail(400, 'That is not a valid invoice id.');

    const [invoiceRes, itemsRes, flagsRes] = await Promise.all([
      db().from('v_invoice_list').select('*').eq('invoice_id', id).maybeSingle(),
      db().from('invoice_items').select('id, item_name, quantity, unit, unit_price, line_total').eq('invoice_id', id).order('item_name'),
      db().from('v_all_flags').select('flag_type, flag_detail').eq('invoice_id', id),
    ]);
    if (invoiceRes.error) throw invoiceRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (flagsRes.error) throw flagsRes.error;
    if (!invoiceRes.data) return fail(404, 'Invoice not found.');

    // The photo bucket is private: make a link that works for 10 minutes.
    let photoUrl: string | null = null;
    if (invoiceRes.data.image_path) {
      const { data } = await db().storage.from(PHOTO_BUCKET).createSignedUrl(invoiceRes.data.image_path, 600);
      photoUrl = data?.signedUrl ?? null;
    }

    return Response.json({ ok: true, invoice: invoiceRes.data, items: itemsRes.data, flags: flagsRes.data, photo_url: photoUrl });
  } catch (err) {
    return handleError(err, 'invoices:detail');
  }
}
