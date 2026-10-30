// GET /api/prices -> price alerts (v_flag_price_jumps), the supplier scorecard (v_vendor_scorecard)
// and the list of items that can be compared
import { handleError } from '@/lib/api-helpers';
import { db } from '@/lib/supabase-server';
import type { PriceItemSummary } from '@/lib/types';

export async function GET() {
  try {
    const [jumpsRes, itemsRes, vendorsRes] = await Promise.all([
      db().from('v_flag_price_jumps').select('*').order('invoice_date', { ascending: false }).limit(50),
      db().from('v_price_comparison').select('item_key, item_name, unit, vendors_selling_it'),
      // ranked vendors first (1 = raised prices the most), the ones with too little data last
      db().from('v_vendor_scorecard').select('*').order('price_rise_rank', { ascending: true, nullsFirst: false }).order('vendor_name'),
    ]);
    if (jumpsRes.error) throw jumpsRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (vendorsRes.error) throw vendorsRes.error;

    // The view has one row per vendor; the list needs one row per item + unit.
    const seen = new Map<string, PriceItemSummary>();
    for (const row of itemsRes.data as PriceItemSummary[]) {
      const key = `${row.item_key}|${row.unit}`;
      if (!seen.has(key)) seen.set(key, row);
    }
    const items = [...seen.values()].sort(
      (a, b) => b.vendors_selling_it - a.vendors_selling_it || a.item_name.localeCompare(b.item_name),
    );

    return Response.json({ ok: true, jumps: jumpsRes.data, items, vendors: vendorsRes.data });
  } catch (err) {
    return handleError(err, 'prices');
  }
}
