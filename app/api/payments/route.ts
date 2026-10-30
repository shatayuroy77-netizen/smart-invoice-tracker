// GET /api/payments -> the summary numbers (v_payments_summary), the unpaid invoices (v_payments_due)
// and the week-by-week cash flow (v_cashflow_weekly)
import { handleError } from '@/lib/api-helpers';
import { db } from '@/lib/supabase-server';

export async function GET() {
  try {
    const [summaryRes, dueRes, weeklyRes] = await Promise.all([
      db().from('v_payments_summary').select('*').single(),
      db().from('v_payments_due').select('*').order('bucket_order').order('due_date').order('vendor_name'),
      db().from('v_cashflow_weekly').select('*').order('week_no'),
    ]);
    if (summaryRes.error) throw summaryRes.error;
    if (dueRes.error) throw dueRes.error;
    if (weeklyRes.error) throw weeklyRes.error;
    return Response.json({ ok: true, summary: summaryRes.data, invoices: dueRes.data, weekly: weeklyRes.data });
  } catch (err) {
    return handleError(err, 'payments');
  }
}
