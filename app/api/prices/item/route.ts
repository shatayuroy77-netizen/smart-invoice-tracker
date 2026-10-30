// GET /api/prices/item?key=sugar&unit=kg
// -> how every vendor prices this item (v_price_comparison) and how the prices changed over time (v_price_history)
import type { NextRequest } from 'next/server';
import { fail, handleError } from '@/lib/api-helpers';
import { db } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get('key')?.slice(0, 200);
    const unit = request.nextUrl.searchParams.get('unit')?.slice(0, 30);
    if (!key || !unit) return fail(400, 'Both "key" and "unit" are needed.');

    const [comparisonRes, historyRes] = await Promise.all([
      db().from('v_price_comparison').select('*').eq('item_key', key).eq('unit', unit).order('latest_price'),
      db()
        .from('v_price_history')
        .select('invoice_id, invoice_number, invoice_date, vendor_id, vendor_name, unit_price, previous_price, price_change_pct')
        .eq('item_key', key)
        .eq('unit', unit)
        .order('invoice_date'),
    ]);
    if (comparisonRes.error) throw comparisonRes.error;
    if (historyRes.error) throw historyRes.error;
    return Response.json({ ok: true, comparison: comparisonRes.data, history: historyRes.data });
  } catch (err) {
    return handleError(err, 'prices:item');
  }
}
