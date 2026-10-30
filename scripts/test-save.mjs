// End-to-end test of the save flow against the running dev server and the live database.
// Run:  node --env-file=.env.local scripts/test-save.mjs [path-to-invoice-image]
// It scans one sample invoice, saves it, tries to save it again (must be stopped as a duplicate),
// opens the photo, marks the invoice paid and unpaid again, and finally removes everything it created.
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const imagePath = process.argv[2] ?? 'public/samples/sample-1-clean.jpg';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const bytes = await readFile(imagePath);
const image = new Blob([bytes], { type: 'image/jpeg' });

// 1. Scan
const scanForm = new FormData();
scanForm.append('image', image, 'invoice.jpg');
const scanRes = await fetch(`${BASE}/api/scan`, { method: 'POST', body: scanForm });
const scan = await scanRes.json();
check('scan reads the invoice', scan.ok === true, `vendor=${scan.invoice?.vendor_name} no=${scan.invoice?.invoice_number}`);
if (!scan.ok) process.exit(1);

// Make the invoice number unique so it cannot collide with data that is already saved.
const testNumber = `TEST-${Date.now()}`;
const payload = { ...scan.invoice, invoice_number: testNumber, allow_duplicate: false };
delete payload.due_date_source;

async function save(allowDuplicate) {
  const form = new FormData();
  form.append('data', JSON.stringify({ ...payload, allow_duplicate: allowDuplicate }));
  form.append('image', image, 'invoice.jpg');
  const res = await fetch(`${BASE}/api/invoices`, { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}

let invoiceId = null;
let vendorId = null;
try {
  // 2. First save
  const first = await save(false);
  invoiceId = first.body.invoice_id ?? null;
  vendorId = first.body.vendor_id ?? null;
  check('first save succeeds', first.status < 300 && first.body.saved === true, `status=${first.status} keys=${Object.keys(first.body).join(',')}`);

  // 3. Same invoice again -> must be stopped
  const second = await save(false);
  check('second save is stopped as duplicate', second.body.saved === false && (second.body.duplicates?.length ?? 0) > 0, `status=${second.status} duplicates=${second.body.duplicates?.length}`);

  if (invoiceId) {
    // 4. Detail + photo
    const detail = await (await fetch(`${BASE}/api/invoices/${invoiceId}`)).json();
    check('detail shows line items', (detail.items?.length ?? 0) === payload.line_items.length, `items=${detail.items?.length}`);
    check('detail has a photo link', typeof detail.photo_url === 'string' && detail.photo_url.length > 0);
    if (detail.photo_url) {
      const photo = await fetch(detail.photo_url);
      check('photo link opens an image', photo.ok && (photo.headers.get('content-type') ?? '').startsWith('image/'), `status=${photo.status}`);
    }

    // 5. Mark paid, repeat (must be refused), undo
    const pay = (paid) => fetch(`${BASE}/api/invoices/${invoiceId}/payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paid }),
    });
    const paid1 = await pay(true);
    check('mark as paid works', paid1.ok, `status=${paid1.status}`);
    const paid2 = await pay(true);
    check('marking paid twice is refused', paid2.status === 409, `status=${paid2.status}`);
    const unpaid = await pay(false);
    check('undo (mark unpaid) works', unpaid.ok, `status=${unpaid.status}`);

    // 6. The new invoice must show up in the list and in the payments screen
    const list = await (await fetch(`${BASE}/api/invoices?q=${testNumber}`)).json();
    check('new invoice appears in the list', list.invoices?.length === 1);
    const payments = await (await fetch(`${BASE}/api/payments`)).json();
    check('new invoice appears in payments', payments.invoices?.some((i) => i.invoice_id === invoiceId) === true);
  }
} finally {
  // Clean up everything this test created (invoice, items, photo, and the vendor if it was created here).
  if (invoiceId) {
    const { data: inv } = await db.from('invoices').select('image_path').eq('id', invoiceId).maybeSingle();
    if (inv?.image_path) await db.storage.from('invoice-photos').remove([inv.image_path]);
    await db.from('invoice_items').delete().eq('invoice_id', invoiceId);
    await db.from('invoices').delete().eq('id', invoiceId);
  }
  if (vendorId) {
    const { count } = await db.from('invoices').select('id', { count: 'exact', head: true }).eq('vendor_id', vendorId);
    if (count === 0) await db.from('vendors').delete().eq('id', vendorId);
  }
  console.log('cleanup done');
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
