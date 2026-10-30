// Sends the test invoice photos to the running server (http://localhost:3000/api/scan)
// and compares what the AI read with the correct answers in test-invoices/expected.json.
// Run (with `npm run dev` running in another terminal):  node scripts/test-scan.mjs
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const expected = JSON.parse(readFileSync(new URL('../test-invoices/expected.json', import.meta.url), 'utf8'));

let problems = 0;
const bad = (msg) => {
  problems++;
  console.log('   MISMATCH:', msg);
};
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.011;

for (const [file, exp] of Object.entries(expected)) {
  console.log(`\n=== ${file} ===`);
  const form = new FormData();
  form.append('image', new Blob([readFileSync(new URL(`../test-invoices/${file}`, import.meta.url))], { type: 'image/jpeg' }), file);

  const started = Date.now();
  const res = await fetch(`${BASE}/api/scan`, { method: 'POST', body: form });
  const body = await res.json();
  console.log(`HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (!body.ok) {
    bad(`server said: ${body.error}`);
    continue;
  }

  const got = body.invoice;
  for (const key of ['vendor_name', 'vendor_gstin', 'invoice_number', 'invoice_date', 'due_date']) {
    // due_date may be calculated by the server from the printed payment terms
    let want = key === 'due_date' && exp.due_date === null ? got.due_date : exp[key];
    let have = got[key];
    // the test invoice prints the vendor name in CAPITALS and the AI copies it as printed
    if (key === 'vendor_name') {
      want = want?.toLowerCase();
      have = have?.toLowerCase();
    }
    if (have !== want) bad(`${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(have)}`);
  }
  for (const key of ['subtotal', 'cgst', 'sgst', 'igst', 'total_amount']) {
    if (!near(got[key], exp[key])) bad(`${key}: expected ${exp[key]}, got ${got[key]}`);
  }
  if (got.line_items.length !== exp.line_items.length) {
    bad(`line count: expected ${exp.line_items.length}, got ${got.line_items.length}`);
  } else {
    exp.line_items.forEach((want, i) => {
      const line = got.line_items[i];
      if (line.item_name !== want.item_name) bad(`line ${i + 1} name: expected "${want.item_name}", got "${line.item_name}"`);
      if (!near(line.quantity, want.quantity)) bad(`line ${i + 1} quantity: expected ${want.quantity}, got ${line.quantity}`);
      if (!near(line.unit_price, want.unit_price)) bad(`line ${i + 1} price: expected ${want.unit_price}, got ${line.unit_price}`);
      if (!near(line.line_total, want.line_total)) bad(`line ${i + 1} total: expected ${want.line_total}, got ${line.line_total}`);
    });
  }
  console.log('warnings:', body.warnings.map((w) => `${w.severity}:${w.field}`).join(', ') || '(none)');
}

console.log(problems === 0 ? '\nALL FIELDS MATCH.' : `\n${problems} mismatch(es) found.`);
process.exit(problems === 0 ? 0 : 1);
