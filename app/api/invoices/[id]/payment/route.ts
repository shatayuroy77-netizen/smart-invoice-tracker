// POST /api/invoices/:id/payment   body: { "paid": true }  or  { "paid": false }
// "Mark as paid" sets the status and today's date (India). { "paid": false } undoes a mistake.
import type { NextRequest } from 'next/server';
import { fail, handleError, UUID_PATTERN } from '@/lib/api-helpers';
import { db, todayIst } from '@/lib/supabase-server';

export async function POST(request: NextRequest, ctx: RouteContext<'/api/invoices/[id]/payment'>) {
  try {
    const { id } = await ctx.params;
    if (!UUID_PATTERN.test(id)) return fail(400, 'That is not a valid invoice id.');

    const body = await request.json().catch(() => null);
    if (typeof body?.paid !== 'boolean') return fail(400, 'Send { "paid": true } or { "paid": false }.');

    // The extra .eq() on payment_status makes this safe to press twice: it only changes
    // an invoice that is really in the opposite state.
    const update = body.paid
      ? { payment_status: 'paid', paid_on: todayIst() }
      : { payment_status: 'unpaid', paid_on: null };
    const { data, error } = await db()
      .from('invoices')
      .update(update)
      .eq('id', id)
      .eq('payment_status', body.paid ? 'unpaid' : 'paid')
      .select('id, payment_status, paid_on');
    if (error) throw error;
    if (!data || data.length === 0) {
      // Nothing changed: either the invoice does not exist, or it was already in the wanted state.
      const { data: existing, error: lookupError } = await db().from('invoices').select('id').eq('id', id).maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) return fail(404, 'Invoice not found.');
      return fail(409, body.paid ? 'This invoice is already marked as paid.' : 'This invoice is not marked as paid.');
    }
    return Response.json({ ok: true, invoice: data[0] });
  } catch (err) {
    return handleError(err, 'invoices:payment');
  }
}
