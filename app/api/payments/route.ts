// GET /api/payments -> the summary numbers (v_payments_summary) and the unpaid invoices (v_payments_due)
import { handleError } from '@/lib/api-helpers';
import { db } from '@/lib/supabase-server';

export async function GET() {
  try {
    const [summaryRes, dueRes] = await Promise.all([
      db().from('v_payments_summary').select('*').single(),
      db().from('v_payments_due').select('*').order('bucket_order').order('due_date').order('vendor_name'),
    ]);
    if (summaryRes.error) throw summaryRes.error;
    if (dueRes.error) throw dueRes.error;
    return Response.json({ ok: true, summary: summaryRes.data, invoices: dueRes.data });
  } catch (err) {
    return handleError(err, 'payments');
  }
}
