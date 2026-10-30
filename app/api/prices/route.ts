// GET /api/prices -> price alerts (v_flag_price_jumps) and the list of items that can be compared
import { handleError } from '@/lib/api-helpers';
import { db } from '@/lib/supabase-server';
import type { PriceItemSummary } from '@/lib/types';

export async function GET() {
  try {
    const [jumpsRes, itemsRes] = await Promise.all([
      db().from('v_flag_price_jumps').select('*').order('invoice_date', { ascending: false }).limit(50),
      db().from('v_price_comparison').select('item_key, item_name, unit, vendors_selling_it'),
    ]);
    if (jumpsRes.error) throw jumpsRes.error;
    if (itemsRes.error) throw itemsRes.error;

    // The view has one row per vendor; the list needs one row per item + unit.
    const seen = new Map<string, PriceItemSummary>();
    for (const row of itemsRes.data as PriceItemSummary[]) {
      const key = `${row.item_key}|${row.unit}`;
      if (!seen.has(key)) seen.set(key, row);
    }
    const items = [...seen.values()].sort(
      (a, b) => b.vendors_selling_it - a.vendors_selling_it || a.item_name.localeCompare(b.item_name),
    );

    return Response.json({ ok: true, jumps: jumpsRes.data, items });
  } catch (err) {
    return handleError(err, 'prices');
  }
}
