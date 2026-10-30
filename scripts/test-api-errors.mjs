// Sends deliberately wrong or hostile input to every API route and checks that each one answers
// politely: a 4xx status with { ok: false, error } and never a 500 or a crash.
// Run:  node scripts/test-api-errors.mjs            (server must be running)
// Pass --rate-limit to also run the scan rate-limit test (it blocks real scans for about a minute).
const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const withRateLimit = process.argv.includes('--rate-limit');
let failed = 0;

const GOOD_UUID = 'b0000000-0000-0000-0000-000000000001';
const MISSING_UUID = '11111111-1111-4111-8111-111111111111';

async function call(method, path, { body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, { method, body, headers });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}
const jsonPost = (path, obj) => call('POST', path, { body: JSON.stringify(obj), headers: { 'content-type': 'application/json' } });

function expectPolite(name, r, wantStatus) {
  const politeBody = r.json && r.json.ok === false && typeof r.json.error === 'string' && r.json.error.length > 0;
  const statusOk = wantStatus ? r.status === wantStatus : r.status >= 400 && r.status < 500;
  const ok = statusOk && politeBody;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -> ${r.status} ${r.json?.error ?? '(no error message)'}`);
}
function expectOk(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

const imageForm = (bytes, type, name) => {
  const f = new FormData();
  f.append('image', new Blob([bytes], { type }), name);
  return f;
};
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];

console.log('--- /api/scan ---');
expectOk('scan: GET is not allowed', (await call('GET', '/api/scan')).status === 405);
expectPolite('scan: no image sent', await call('POST', '/api/scan', { body: new FormData() }), 400);
expectPolite('scan: text file renamed .jpg', await call('POST', '/api/scan', { body: imageForm(new TextEncoder().encode('hello, I am not a picture'), 'image/jpeg', 'x.jpg') }));
expectPolite('scan: GIF is not accepted', await call('POST', '/api/scan', { body: imageForm(new TextEncoder().encode('GIF89a......'), 'image/gif', 'x.gif') }));
const big = new Uint8Array(5 * 1024 * 1024); big.set(JPEG_HEAD);
expectPolite('scan: 5 MB file is too big', await call('POST', '/api/scan', { body: imageForm(big, 'image/jpeg', 'big.jpg') }));
expectPolite('scan: empty file', await call('POST', '/api/scan', { body: imageForm(new Uint8Array(0), 'image/jpeg', 'empty.jpg') }));

console.log('\n--- /api/invoices (list) ---');
const base = await call('GET', '/api/invoices');
const total = base.json?.invoices?.length ?? -1;
expectOk('list: normal request works', base.status === 200 && total > 0, `${total} invoices`);
for (const q of [`'; drop table invoices; --`, `%`, `",()*\\`, `<script>alert(1)</script>`, 'a'.repeat(500)]) {
  const r = await call('GET', `/api/invoices?q=${encodeURIComponent(q)}`);
  expectOk(`list: hostile search ${JSON.stringify(q.slice(0, 20))}`, r.status === 200 && r.json?.ok === true, `status ${r.status}`);
}
const after = await call('GET', '/api/invoices');
expectOk('list: nothing was damaged by the hostile searches', (after.json?.invoices?.length ?? -2) === total, `${after.json?.invoices?.length} invoices`);
const odd = await call('GET', '/api/invoices?status=banana');
expectOk('list: unknown status does not crash', odd.status < 500, `status ${odd.status}`);

console.log('\n--- /api/invoices/[id] ---');
expectPolite('detail: id is not a UUID', await call('GET', '/api/invoices/not-a-uuid'), 400);
expectPolite('detail: id does not exist', await call('GET', `/api/invoices/${MISSING_UUID}`), 404);
expectPolite('detail: SQL in id', await call('GET', `/api/invoices/${encodeURIComponent("1' or '1'='1")}`), 400);

console.log('\n--- /api/invoices/[id]/payment ---');
expectPolite('payment: id is not a UUID', await jsonPost('/api/invoices/nope/payment', { paid: true }), 400);
expectPolite('payment: invoice does not exist', await jsonPost(`/api/invoices/${MISSING_UUID}/payment`, { paid: true }), 404);
expectPolite('payment: body is not JSON', await call('POST', `/api/invoices/${GOOD_UUID}/payment`, { body: 'garbage', headers: { 'content-type': 'application/json' } }), 400);
expectPolite('payment: "paid" is a string, not true/false', await jsonPost(`/api/invoices/${GOOD_UUID}/payment`, { paid: 'yes' }), 400);

console.log('\n--- POST /api/invoices (save) ---');
const valid = {
  vendor_name: 'Test Vendor', vendor_gstin: null, invoice_number: 'ERR-TEST-1', invoice_date: '2026-10-01', due_date: '2026-10-31',
  payment_terms_days: 30, subtotal: 100, cgst: 0, sgst: 0, igst: 0, total_amount: 100, allow_duplicate: false,
  line_items: [{ item_name: 'Thing', quantity: 1, unit: 'pcs', unit_price: 100, line_total: 100 }],
};
const saveForm = (obj, raw) => { const f = new FormData(); f.append('data', raw ?? JSON.stringify(obj)); return f; };
expectPolite('save: no data field', await call('POST', '/api/invoices', { body: new FormData() }), 400);
expectPolite('save: data is not JSON', await call('POST', '/api/invoices', { body: saveForm(null, '{oops') }), 400);
expectPolite('save: empty vendor name', await call('POST', '/api/invoices', { body: saveForm({ ...valid, vendor_name: '   ' }) }), 400);
expectPolite('save: no line items', await call('POST', '/api/invoices', { body: saveForm({ ...valid, line_items: [] }) }), 400);
expectPolite('save: negative quantity', await call('POST', '/api/invoices', { body: saveForm({ ...valid, line_items: [{ ...valid.line_items[0], quantity: -3 }] }) }), 400);
expectPolite('save: date in wrong format (DD-MM-YYYY)', await call('POST', '/api/invoices', { body: saveForm({ ...valid, invoice_date: '01-10-2026' }) }), 400);
expectPolite('save: money as text', await call('POST', '/api/invoices', { body: saveForm({ ...valid, total_amount: 'lots' }) }), 400);
expectPolite('save: absurd amount', await call('POST', '/api/invoices', { body: saveForm({ ...valid, total_amount: 1e15 }) }), 400);
const badPhoto = saveForm(valid); badPhoto.append('image', new Blob(['not an image'], { type: 'image/jpeg' }), 'x.jpg');
expectPolite('save: photo is not a real image', await call('POST', '/api/invoices', { body: badPhoto }));
const dueBeforeInvoice = await call('POST', '/api/invoices', { body: saveForm({ ...valid, invoice_number: 'ERR-TEST-2', due_date: '2026-09-01' }) });
expectOk('save: due date before invoice date does not crash', dueBeforeInvoice.status < 500, `status ${dueBeforeInvoice.status} ${dueBeforeInvoice.json?.error ?? ''}`);
const finalCount = await call('GET', '/api/invoices');
expectOk('save: none of the bad saves created an invoice', (finalCount.json?.invoices?.length ?? -2) === total, `${finalCount.json?.invoices?.length} invoices (was ${total})`);

console.log('\n--- /api/prices ---');
expectPolite('prices item: no key', await call('GET', '/api/prices/item'), 400);
const noSuch = await call('GET', '/api/prices/item?key=does%20not%20exist&unit=kg');
expectOk('prices item: unknown item answers calmly', noSuch.status < 500, `status ${noSuch.status}`);
const sqlKey = await call('GET', `/api/prices/item?key=${encodeURIComponent("x' or 1=1 --")}&unit=kg`);
expectOk('prices item: SQL in key answers calmly', sqlKey.status < 500, `status ${sqlKey.status}`);

if (withRateLimit) {
  console.log('\n--- rate limit (/api/scan, max 12 per minute per visitor) ---');
  let got429 = false;
  for (let i = 0; i < 16 && !got429; i++) {
    const r = await call('POST', '/api/scan', { body: new FormData() });
    if (r.status === 429) got429 = true;
  }
  expectOk('scan: too many requests in a minute get 429', got429);
}

console.log(failed === 0 ? '\nAll error-handling checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
