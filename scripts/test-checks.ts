// Tests for lib/invoice-checks.ts (no AI and no internet needed).
// Run:  node scripts/test-checks.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkInvoice, type RawInvoice } from '../lib/invoice-checks.ts';

const expected = JSON.parse(readFileSync(new URL('../test-invoices/expected.json', import.meta.url), 'utf8'));
const TODAY = '2026-10-29';
const base = (name: string): RawInvoice => ({ ...structuredClone(expected[name]), unclear_fields: [] });
const fields = (ws: { field: string; severity: string }[], severity?: string) =>
  ws.filter((w) => !severity || w.severity === severity).map((w) => w.field);

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('ok  -', name);
}

test('clean invoice A: no errors, due date calculated from "Net 30 days"', () => {
  const { invoice, warnings } = checkInvoice(base('invoice-A-clean.jpg'), { today: TODAY });
  assert.deepEqual(fields(warnings, 'error'), []);
  assert.equal(invoice.due_date, '2026-11-26');
  assert.equal(invoice.due_date_source, 'calculated_from_terms');
  assert.equal(invoice.cgst, 369.25);
  assert.equal(invoice.total_amount, 15508.5);
});

test('invoice B: printed due date kept, bad GSTIN (letter O) warned, no errors', () => {
  const { invoice, warnings } = checkInvoice(base('invoice-B-phone-photo.jpg'), { today: TODAY });
  assert.deepEqual(fields(warnings, 'error'), []);
  assert.equal(invoice.due_date, '2026-11-04');
  assert.equal(invoice.due_date_source, 'printed');
  assert.deepEqual(fields(warnings), ['vendor_gstin']);
});

test('GSTIN is upper-cased and spaces removed, but characters are never "fixed"', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.vendor_gstin = ' 19sgosp 7733m1zb ';
  const { invoice, warnings } = checkInvoice(raw, { today: TODAY });
  assert.equal(invoice.vendor_gstin, '19SGOSP7733M1ZB');
  assert.ok(!fields(warnings).includes('vendor_gstin'));
});

test('misread total is caught', () => {
  const raw = base('invoice-B-phone-photo.jpg');
  raw.total_amount = 18368.32;
  assert.ok(fields(checkInvoice(raw, { today: TODAY }).warnings).includes('total_amount'));
});

test('rounded-off total (within Rs 1.50) is accepted', () => {
  const raw = base('invoice-B-phone-photo.jpg');
  raw.total_amount = 13368;
  assert.ok(!fields(checkInvoice(raw, { today: TODAY }).warnings).includes('total_amount'));
});

test('quantity x price not equal to line total is caught', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.line_items[1].quantity = 400; // really 40
  const ws = checkInvoice(raw, { today: TODAY }).warnings;
  assert.ok(fields(ws).includes('line_items[1]'));
});

test('lines not adding up to the sub total is caught', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.line_items.pop();
  assert.ok(fields(checkInvoice(raw, { today: TODAY }).warnings).includes('subtotal'));
});

test('missing vendor, number and date are errors', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.vendor_name = null;
  raw.invoice_number = '  ';
  raw.invoice_date = null;
  const errs = fields(checkInvoice(raw, { today: TODAY }).warnings, 'error');
  assert.deepEqual(errs.sort(), ['invoice_date', 'invoice_number', 'vendor_name']);
});

test('impossible date (month 13) is an error and becomes null', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.invoice_date = '2026-13-40';
  const { invoice, warnings } = checkInvoice(raw, { today: TODAY });
  assert.equal(invoice.invoice_date, null);
  assert.ok(fields(warnings, 'error').includes('invoice_date'));
});

test('future date and old date are warned', () => {
  const future = base('invoice-A-clean.jpg');
  future.invoice_date = '2026-12-01';
  assert.ok(fields(checkInvoice(future, { today: TODAY }).warnings).includes('invoice_date'));
  const old = base('invoice-A-clean.jpg');
  old.invoice_date = '2023-01-10';
  assert.ok(fields(checkInvoice(old, { today: TODAY }).warnings).includes('invoice_date'));
});

test('due date before invoice date is warned', () => {
  const raw = base('invoice-B-phone-photo.jpg');
  raw.due_date = '2026-09-01';
  assert.ok(fields(checkInvoice(raw, { today: TODAY }).warnings).includes('due_date'));
});

test('IGST together with CGST/SGST is warned; unequal CGST and SGST is warned', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.igst = 100;
  raw.sgst = 300;
  const f = fields(checkInvoice(raw, { today: TODAY }).warnings);
  assert.ok(f.includes('igst'));
  assert.ok(f.includes('sgst'));
});

test('no line items is an error; missing total is calculated and still an error to confirm', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.total_amount = null;
  const a = checkInvoice(raw, { today: TODAY });
  assert.equal(a.invoice.total_amount, 15508.5);
  assert.ok(fields(a.warnings, 'error').includes('total_amount'));
  raw.line_items = [];
  raw.subtotal = null;
  assert.ok(fields(checkInvoice(raw, { today: TODAY }).warnings, 'error').includes('line_items'));
});

test('missing due date and missing terms: asks to use the vendor credit days', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.payment_terms_days = null;
  const { invoice, warnings } = checkInvoice(raw, { today: TODAY });
  assert.equal(invoice.due_date, null);
  assert.ok(fields(warnings).includes('due_date'));
});

test('an invoice with no unit column can still be saved: unit becomes "pcs" with a warning, not an error', () => {
  const inv = base('invoice-A-clean.jpg');
  for (const li of inv.line_items) li.unit = null;
  inv.line_items[0].unit = '   '; // spaces only counts as "no unit" too
  const { invoice, warnings } = checkInvoice(inv, { today: TODAY });
  assert.ok(invoice.line_items.every((li) => li.unit === 'pcs'), 'every line gets the default unit');
  assert.equal(fields(warnings, 'error').length, 0, 'no error, so Save stays possible');
  assert.equal(warnings.filter((w) => w.severity === 'warn' && w.message.includes('no unit is shown')).length, invoice.line_items.length);
});

test('a cash memo with no invoice number can still be saved: a reference is made from date and total', () => {
  const inv = base('invoice-A-clean.jpg');
  inv.invoice_number = null;
  const { invoice, warnings } = checkInvoice(inv, { today: TODAY });
  assert.equal(invoice.invoice_number, `NO-NUMBER-${invoice.invoice_date}-${invoice.total_amount}`);
  assert.equal(fields(warnings, 'error').length, 0, 'no error, so Save stays possible');
  assert.ok(warnings.some((w) => w.severity === 'warn' && w.field === 'invoice_number'));
});

test('no invoice number AND no date is still an error (there is nothing to build a reference from)', () => {
  const inv = base('invoice-A-clean.jpg');
  inv.invoice_number = null;
  inv.invoice_date = null;
  const { warnings } = checkInvoice(inv, { today: TODAY });
  assert.ok(warnings.some((w) => w.severity === 'error' && w.field === 'invoice_number'));
});

test('a unit that is printed is kept (lower-cased) and gets no warning', () => {
  const inv = base('invoice-A-clean.jpg');
  inv.line_items[0].unit = ' KG ';
  const { invoice, warnings } = checkInvoice(inv, { today: TODAY });
  assert.equal(invoice.line_items[0].unit, 'kg');
  assert.ok(!warnings.some((w) => w.field === 'line_items[0]' && w.message.includes('no unit')));
});

test("the AI's own 'unclear_fields' are passed on", () => {
  const raw = base('invoice-A-clean.jpg');
  raw.unclear_fields = ['vendor_gstin'];
  assert.ok(fields(checkInvoice(raw, { today: TODAY }).warnings).includes('unclear_fields'));
});

console.log(`\nAll ${passed} tests passed.`);
