// Checks that an invoice in US dollars cannot be saved, with the real AI and the real server.
// Run:  node scripts/test-currency.mjs        (server must be running; uses 2 AI photos of the daily free limit)
// Nothing is saved: the dollar invoice is only scanned, and the save attempts below are all refused.
import { readFile } from 'node:fs/promises';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

async function scan(path) {
  const form = new FormData();
  form.append('image', new Blob([await readFile(path)], { type: 'image/jpeg' }), 'invoice.jpg');
  const res = await fetch(`${BASE}/api/scan`, { method: 'POST', body: form });
  return { status: res.status, json: await res.json() };
}

async function countInvoices() {
  const r = await (await fetch(`${BASE}/api/invoices`)).json();
  return r.invoices.length;
}
const before = await countInvoices();

console.log('--- the dollar invoice (test-invoices/foreign/usd-invoice.jpg) ---');
const usd = await scan('test-invoices/foreign/usd-invoice.jpg');
if (usd.status === 429) {
  console.log('SKIP  the free AI limit is used up for today, so photos cannot be read. Run this test again after about 12:30 pm India time.');
  process.exit(2);
}
check('scan answers', usd.status === 200 && usd.json.ok === true, `status ${usd.status}`);
const dollars = usd.json.invoice;
check('the AI reports a non-rupee currency', dollars?.currency != null && dollars.currency !== 'INR', `currency=${dollars?.currency}`);
check('the invoice has a red currency error, so Save is blocked', usd.json.warnings?.some((w) => w.field === 'currency' && w.severity === 'error') && usd.json.has_errors === true);
check('the red message names the currency', usd.json.warnings?.some((w) => w.field === 'currency' && w.message.includes(dollars.currency)), usd.json.warnings?.find((w) => w.field === 'currency')?.message);
check('the rest was still read correctly (vendor, number, total)', dollars?.vendor_name === 'Global Tech Solutions' && dollars?.invoice_number === 'INV-2023-0045' && dollars?.total_amount === 1895.4);

console.log('\n--- the server refuses it even if the screen is bypassed ---');
const payload = (currency) => ({
  vendor_name: 'Global Tech Solutions',
  vendor_gstin: null,
  invoice_number: `CURRENCY-TEST-${Date.now()}`,
  invoice_date: '2026-10-01',
  due_date: '2026-10-31',
  payment_terms_days: 30,
  ...(currency === undefined ? {} : { currency }),
  line_items: [{ item_name: 'Thing', quantity: 1, unit: 'pcs', unit_price: 100, line_total: 100 }],
  subtotal: 100,
  cgst: 0,
  sgst: 0,
  igst: 0,
  total_amount: 100,
  allow_duplicate: false,
});
for (const currency of ['USD', '$', 'EUR']) {
  const form = new FormData();
  form.append('data', JSON.stringify(payload(currency)));
  const res = await fetch(`${BASE}/api/invoices`, { method: 'POST', body: form });
  const out = await res.json();
  check(`saving with currency ${JSON.stringify(currency)} is refused`, res.status === 400 && out.ok === false && /currency|rupee/i.test(out.error), `${res.status} ${out.error}`);
}
check('no invoice was created by any of the attempts', (await countInvoices()) === before);

// Only a currency we are SURE is foreign is refused. An unclear answer (an odd word, an unknown code) is just a
// warning on the screen, so the server must accept it. This part saves ONE test invoice and removes it again,
// so it needs the database keys:  node --env-file=.env.local scripts/test-currency.mjs
console.log('\n--- an unclear currency is NOT refused by the server ---');
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let invoiceId = null;
  let vendorId = null;
  try {
    const form = new FormData();
    form.append('data', JSON.stringify({ ...payload('XYZ'), vendor_name: 'Currency Test Vendor' }));
    const res = await fetch(`${BASE}/api/invoices`, { method: 'POST', body: form });
    const out = await res.json();
    invoiceId = out.invoice_id ?? null;
    vendorId = out.vendor_id ?? null;
    check('saving with an unclear currency ("XYZ") is accepted', res.status === 200 && out.saved === true, `${res.status} saved=${out.saved}`);
  } finally {
    if (invoiceId) {
      await db.from('invoice_items').delete().eq('invoice_id', invoiceId);
      await db.from('invoices').delete().eq('id', invoiceId);
    }
    if (vendorId) {
      const { count } = await db.from('invoices').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId);
      if (count === 0) await db.from('vendors').delete().eq('id', vendorId);
    }
  }
  check('the test invoice was removed again', (await countInvoices()) === before);
} else {
  console.log('SKIP  no database keys in the environment (run with: node --env-file=.env.local scripts/test-currency.mjs)');
}

console.log('\n--- a rupee invoice is not affected (sample-1-clean.jpg) ---');
const rupee = await scan('public/samples/sample-1-clean.jpg');
if (rupee.status === 429) {
  console.log('SKIP  the free AI limit ran out before the rupee invoice (the dollar checks above are done).');
} else {
  check('scan answers', rupee.status === 200 && rupee.json.ok === true, `status ${rupee.status}`);
  check('currency is INR or not printed', rupee.json.invoice?.currency === 'INR' || rupee.json.invoice?.currency === null, `currency=${rupee.json.invoice?.currency}`);
  check('no currency error, so it can still be saved', !rupee.json.warnings?.some((w) => w.field === 'currency') && rupee.json.has_errors === false);
}

console.log(failed === 0 ? '\nAll currency checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
