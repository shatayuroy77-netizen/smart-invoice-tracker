// Scans each differently styled test invoice (test-invoices/variety/) and compares what the AI read with the
// right answers in expected.json. Shows, for every invoice, what was wrong and whether Save would be possible.
//   node scripts/test-variety.mjs              (server must be running)
// The images and answers are made by scripts/make-variety-invoices.py. Scans cost a little Gemini quota.
import { readFile } from 'node:fs/promises';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const DIR = new URL('../test-invoices/variety/', import.meta.url);
const expected = JSON.parse(await readFile(new URL('expected.json', DIR), 'utf8'));
const MIME = { jpg: 'image/jpeg', png: 'image/png' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => a != null && Math.abs(Number(a) - Number(b)) <= tol;
const norm = (s) => String(s ?? '').replace(/\s+/g, '').toUpperCase();

async function scan(file) {
  const bytes = await readFile(new URL(file, DIR));
  const form = new FormData();
  form.append('image', new Blob([bytes], { type: MIME[file.split('.').pop()] }), file);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${BASE}/api/scan`, { method: 'POST', body: form });
    const json = await res.json().catch(() => ({}));
    if (res.status === 429) { await sleep(20000); continue; } // scan limit: wait a little, try again
    return { status: res.status, json };
  }
  return { status: 429, json: {} };
}

function compare(exp, inv) {
  const problems = [];
  const vendor = String(inv.vendor_name ?? '').toUpperCase();
  if (!exp.vendor_contains.some((v) => vendor.includes(v.toUpperCase()))) problems.push(`vendor "${inv.vendor_name}"`);
  if (norm(inv.invoice_number) !== norm(exp.invoice_number)) problems.push(`invoice no "${inv.invoice_number}" (expected ${exp.invoice_number})`);
  if (inv.invoice_date !== exp.invoice_date) problems.push(`date ${inv.invoice_date} (expected ${exp.invoice_date})`);
  if (!near(inv.total_amount, exp.total_amount, 1)) problems.push(`total ${inv.total_amount} (expected ${exp.total_amount})`);
  if (exp.subtotal != null && !near(inv.subtotal, exp.subtotal, 1)) problems.push(`sub total ${inv.subtotal} (expected ${exp.subtotal})`);
  for (const k of ['cgst', 'sgst', 'igst']) if (!near(inv[k], exp[k], 0.06)) problems.push(`${k} ${inv[k]} (expected ${exp[k]})`);
  if (inv.line_items.length !== exp.lines.length) {
    problems.push(`${inv.line_items.length} lines (expected ${exp.lines.length})`);
  } else {
    exp.lines.forEach((l, i) => {
      const got = inv.line_items[i];
      if (!near(got.quantity, l.qty, 0.001)) problems.push(`line ${i + 1} qty ${got.quantity} (expected ${l.qty})`);
      if (l.unit_price != null && !near(got.unit_price, l.unit_price, 0.01)) problems.push(`line ${i + 1} price ${got.unit_price} (expected ${l.unit_price})`);
    });
  }
  return problems;
}

let fullyRight = 0;
let canSave = 0;
// Optional: name some files to scan only those, e.g.  node scripts/test-variety.mjs phone-photo.jpg
const only = process.argv.slice(2);
const names = Object.keys(expected).filter((n) => only.length === 0 || only.includes(n));
for (const file of names) {
  process.stdout.write(`${file.padEnd(24)} `);
  const started = Date.now();
  const { status, json } = await scan(file);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!json.ok) {
    console.log(`SCAN FAILED  (HTTP ${status}, after ${seconds}s) ${json.error ?? ''}`);
    continue;
  }
  process.stdout.write(`[${seconds}s] `);
  const problems = compare(expected[file], json.invoice);
  const blockers = json.warnings.filter((w) => w.severity === 'error');
  if (problems.length === 0) fullyRight++;
  if (!json.has_errors) canSave++;
  console.log(`${problems.length === 0 ? 'ALL RIGHT ' : 'WRONG     '} ${json.has_errors ? 'Save BLOCKED' : 'Save possible'}`);
  for (const p of problems) console.log(`      wrong: ${p}`);
  for (const w of blockers) console.log(`      blocks Save: ${w.message}`);
  await sleep(2000);
}
console.log(`\n${fullyRight} of ${names.length} invoices read completely right; Save is possible for ${canSave} of ${names.length}.`);
process.exit(0);
