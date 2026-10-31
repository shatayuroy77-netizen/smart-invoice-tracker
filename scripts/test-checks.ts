// Tests for lib/invoice-checks.ts (no AI and no internet needed).
// Run:  node scripts/test-checks.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkInvoice, currencyKind, isRupee, normalizeCurrency, type RawInvoice } from '../lib/invoice-checks.ts';

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

test('rupee spellings and "no currency printed" are all fine', () => {
  for (const currency of ['INR', 'inr', 'Rs.', 'Rs', 'Rs/-', '₹', 'Rupees', 'Indian Rupee', 'रुपये', 'টাকা', null, '', '  ']) {
    const raw = base('invoice-A-clean.jpg');
    raw.currency = currency;
    const { invoice, warnings } = checkInvoice(raw, { today: TODAY });
    assert.ok(!fields(warnings).includes('currency'), `"${currency}" must not raise a currency problem`);
    assert.ok(invoice.currency === 'INR' || invoice.currency === null);
  }
  const noField = base('invoice-A-clean.jpg'); // an answer without the field at all (older callers)
  assert.deepEqual(fields(checkInvoice(noField, { today: TODAY }).warnings, 'error'), []);
});

test('an invoice in US dollars is a red error (Save is blocked) that names the currency', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.currency = 'USD';
  const { invoice, warnings } = checkInvoice(raw, { today: TODAY });
  assert.equal(invoice.currency, 'USD');
  const problem = warnings.find((w) => w.field === 'currency');
  assert.equal(problem?.severity, 'error');
  assert.ok(problem?.message.includes('USD'));
});

test('currency symbols are understood: "$" is USD, "€" is EUR, spaces and case do not matter', () => {
  assert.equal(normalizeCurrency(' $ '), 'USD');
  assert.equal(normalizeCurrency('€'), 'EUR');
  assert.equal(normalizeCurrency(' usd '), 'USD');
  assert.equal(normalizeCurrency('Rs.'), 'INR');
  assert.equal(isRupee('USD'), false);
  assert.equal(isRupee('EUR'), false);
  assert.equal(isRupee('INR'), true);
  assert.equal(isRupee(undefined), true);
});

test('a foreign invoice does not also get the misleading "tax does not add up" warning', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.currency = 'USD';
  raw.cgst = 0; // a US sales tax has no place in CGST/SGST/IGST ...
  raw.sgst = 0;
  raw.igst = 0; // ... so subtotal + tax can never reach the printed total
  const ws = checkInvoice(raw, { today: TODAY }).warnings;
  assert.ok(fields(ws).includes('currency'));
  assert.ok(!fields(ws).includes('total_amount'));
  // the same numbers on a rupee invoice are still caught
  const rupee = base('invoice-A-clean.jpg');
  rupee.cgst = 0;
  rupee.sgst = 0;
  rupee.igst = 0;
  assert.ok(fields(checkInvoice(rupee, { today: TODAY }).warnings).includes('total_amount'));
});

test('currency is blocked only when we are SURE: known foreign codes and symbols are red, odd answers are only yellow', () => {
  for (const sure of ['USD', 'usd', '$', 'US$', 'EUR', '€', 'GBP', '£', 'AED', 'SGD', 'AUD']) {
    assert.equal(currencyKind(sure), 'foreign', `${sure} is foreign`);
  }
  for (const doubtful of ['XYZ', 'RUPEES ONLY ONE', 'dollar-ish', 'abcd', 'Z$']) {
    assert.equal(currencyKind(doubtful), 'unclear', `${doubtful} is unclear`);
  }
  assert.equal(currencyKind(null), 'rupee');
  assert.equal(currencyKind('Rs/-'), 'rupee');
  // an unclear answer must NOT lock a rupee invoice out: a warning, never an error
  const raw = base('invoice-A-clean.jpg');
  raw.currency = 'XYZ';
  const ws = checkInvoice(raw, { today: TODAY }).warnings.filter((w) => w.field === 'currency');
  assert.equal(ws.length, 1);
  assert.equal(ws[0].severity, 'warn');
  assert.deepEqual(fields(checkInvoice(raw, { today: TODAY }).warnings, 'error'), []);
});

test('the red currency message tells staff what to do if the AI got it wrong', () => {
  const raw = base('invoice-A-clean.jpg');
  raw.currency = 'USD';
  const message = checkInvoice(raw, { today: TODAY }).warnings.find((w) => w.field === 'currency')?.message ?? '';
  assert.ok(message.includes('Type it myself'));
});

test('a due date before the invoice date is a red error (the database refuses it anyway)', () => {
  const raw = base('invoice-B-phone-photo.jpg');
  raw.due_date = '2026-09-01';
  const problem = checkInvoice(raw, { today: TODAY }).warnings.find((w) => w.field === 'due_date');
  assert.equal(problem?.severity, 'error');
});

test('negative amounts (credit notes, discount lines) are a red error, because the database refuses them', () => {
  const discountLine = base('invoice-A-clean.jpg');
  discountLine.line_items[0].unit_price = -50;
  const a = checkInvoice(discountLine, { today: TODAY }).warnings;
  assert.ok(a.some((w) => w.severity === 'error' && w.field === 'line_items[0]' && w.message.includes('negative')));

  const creditNote = base('invoice-A-clean.jpg');
  creditNote.total_amount = -15508.5;
  const b = checkInvoice(creditNote, { today: TODAY }).warnings;
  assert.ok(b.some((w) => w.severity === 'error' && w.field === 'total_amount' && w.message.includes('below zero')));

  // normal invoices are untouched
  assert.deepEqual(fields(checkInvoice(base('invoice-A-clean.jpg'), { today: TODAY }).warnings, 'error'), []);
});

console.log(`\nAll ${passed} tests passed.`);
