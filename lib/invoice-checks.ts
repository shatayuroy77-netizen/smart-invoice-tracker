// Checks and cleans what the AI read from an invoice photo.
//
// The AI can make mistakes (blurry digits, wrong column). So we never trust it blindly:
// this file re-does the arithmetic and returns a list of warnings that the Scan screen
// shows to the staff member before they press Save.
//
// This file has no imports on purpose, so it can be tested on its own.

export interface RawLineItem {
  item_name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
}

export interface RawInvoice {
  vendor_name: string | null;
  vendor_gstin: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // YYYY-MM-DD
  due_date: string | null; // YYYY-MM-DD, only if printed on the invoice
  payment_terms_days: number | null; // e.g. "Net 30 days" -> 30
  currency?: string | null; // what the AI saw: "INR", "USD"... null when no currency is printed
  line_items: RawLineItem[];
  subtotal: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total_amount: number | null;
  unclear_fields: string[];
}

export interface CleanInvoice {
  vendor_name: string | null;
  vendor_gstin: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  due_date_source: 'printed' | 'calculated_from_terms' | null;
  payment_terms_days: number | null;
  currency: string | null; // cleaned code: "INR" for rupees, another code (for example "USD") makes the invoice unsavable
  line_items: {
    item_name: string;
    quantity: number | null;
    unit: string; // never empty: DEFAULT_UNIT is used when the invoice shows no unit
    unit_price: number | null;
    line_total: number | null;
  }[];
  subtotal: number | null;
  cgst: number;
  sgst: number;
  igst: number;
  total_amount: number | null;
}

export interface Warning {
  // 'error' = staff must fix it before saving, 'warn' = please double-check
  severity: 'error' | 'warn';
  field: string; // e.g. 'total_amount' or 'line_items[2]'
  message: string;
}

// 2 digits + 5 letters + 4 digits + 1 letter + 1 (1-9 or letter) + 'Z' + 1 (digit or letter).
// Same rule as the v_flag_bad_gstin view in the database.
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Many invoices (and almost every AI-made sample) have no separate unit column. That must not stop
// staff from saving, so a missing unit becomes this one, with a "please check" warning.
export const DEFAULT_UNIT = 'pcs';

// This app handles RUPEE invoices only (GST, lakh formatting, Rs everywhere). An invoice in dollars would be
// saved with the wrong meaning ("$1,895" shown as "Rs 1,895") and would spoil the totals and the price
// comparisons. So the AI also reports the currency it sees.
//
// We only BLOCK when we are sure it is a foreign currency. There are three outcomes:
//   'rupee'   : INR, a rupee spelling (Rs, Rs/-, Rupees, a Hindi or Bengali word), or nothing printed at all
//               (most Indian invoices show plain numbers)                                  -> fine
//   'foreign' : a currency we know (USD, EUR, AED ...) or its symbol ($, €, £)               -> red error, no Save
//   'unclear' : anything else (an odd word, an unknown 3-letter code)                       -> yellow warning only
// Blocking on a guess would lock a real rupee invoice out, so a doubtful answer only asks staff to look.
const CURRENCY_ALIASES: Record<string, string> = {
  '₹': 'INR',
  RS: 'INR',
  RUP: 'INR',
  RUPEE: 'INR',
  RUPEES: 'INR',
  INDIANRUPEE: 'INR',
  INDIANRUPEES: 'INR',
  'रुपये': 'INR',
  'रुपया': 'INR',
  'रु': 'INR',
  'रूपये': 'INR',
  'টাকা': 'INR',
  'রুপি': 'INR',
  $: 'USD',
  'US$': 'USD',
  USDOLLAR: 'USD',
  USDOLLARS: 'USD',
  '€': 'EUR',
  '£': 'GBP',
};

// Codes of the currencies we recognise as "clearly not rupees". Not a complete list on purpose:
// a 3-letter code that is not here only gives a warning.
const FOREIGN_CODES = new Set([
  'USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'SGD', 'HKD', 'AUD', 'CAD', 'NZD', 'JPY', 'CNY',
  'CHF', 'SEK', 'NOK', 'DKK', 'ZAR', 'MYR', 'THB', 'IDR', 'PHP', 'VND', 'KRW', 'PKR', 'BDT', 'LKR', 'NPR', 'RUB',
  'TRY', 'BRL', 'MXN', 'EGP', 'ILS',
]);

export type CurrencyKind = 'rupee' | 'foreign' | 'unclear';

// "Rs." -> "INR", "Rs/-" -> "INR", "$" -> "USD", " usd " -> "USD", "" or null -> null (nothing printed)
export function normalizeCurrency(value: string | null | undefined): string | null {
  const key = (value ?? '').toUpperCase().replace(/[\s./-]/g, '');
  if (!key) return null;
  return CURRENCY_ALIASES[key] ?? key;
}

export function currencyKind(value: string | null | undefined): CurrencyKind {
  const code = normalizeCurrency(value);
  if (code === null || code === 'INR') return 'rupee';
  return FOREIGN_CODES.has(code) ? 'foreign' : 'unclear';
}

// true for rupees AND for "no currency printed"
export function isRupee(value: string | null | undefined): boolean {
  return currencyKind(value) === 'rupee';
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z');
  return Math.round(ms / 86_400_000);
}

export function checkInvoice(
  raw: RawInvoice,
  options: { today?: string } = {},
): { invoice: CleanInvoice; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  // ---- text fields ------------------------------------------------------
  const vendor_name = raw.vendor_name?.trim() || null;
  let invoice_number = raw.invoice_number?.trim() || null; // may be filled in near the end, see "no invoice number"
  // GSTIN: capitals and no spaces. We do NOT "fix" characters: a wrong GSTIN must stay visible.
  const vendor_gstin = raw.vendor_gstin ? raw.vendor_gstin.replace(/\s+/g, '').toUpperCase() : null;

  if (!vendor_name) warnings.push({ severity: 'error', field: 'vendor_name', message: 'Vendor name was not found. Please type it.' });

  // A foreign-currency invoice cannot be saved (see the note at CURRENCY_ALIASES): a red error, Save stays blocked.
  // An unclear currency only asks staff to look.
  const currency = normalizeCurrency(raw.currency)?.slice(0, 30) ?? null;
  const currencyType = currencyKind(currency);
  const foreignCurrency = currencyType === 'foreign';
  if (foreignCurrency) {
    warnings.push({
      severity: 'error',
      field: 'currency',
      message: `This invoice is in ${currency}, not rupees. This app only handles rupee invoices, so it cannot be saved here. If the invoice really is in rupees, take a new photo or use "Type it myself".`,
    });
  } else if (currencyType === 'unclear') {
    warnings.push({
      severity: 'warn',
      field: 'currency',
      message: `The AI saw the currency "${currency}" and could not tell whether it is rupees. This app only handles rupees, so please check the invoice is in rupees.`,
    });
  }

  if (vendor_gstin && !GSTIN_PATTERN.test(vendor_gstin)) {
    warnings.push({
      severity: 'warn',
      field: 'vendor_gstin',
      message: `GSTIN "${vendor_gstin}" is not in the standard 15-character format. Compare it with the photo. If the photo is correct it can still be saved, and the invoice will be flagged.`,
    });
  }
  if (!vendor_gstin) {
    warnings.push({ severity: 'warn', field: 'vendor_gstin', message: 'GSTIN was not found on the invoice.' });
  }

  // ---- dates ------------------------------------------------------------
  let invoice_date = raw.invoice_date;
  if (!invoice_date) {
    warnings.push({ severity: 'error', field: 'invoice_date', message: 'Invoice date was not found. Please enter it.' });
  } else if (!isRealDate(invoice_date)) {
    warnings.push({ severity: 'error', field: 'invoice_date', message: `"${invoice_date}" is not a real date. Please enter it.` });
    invoice_date = null;
  } else if (invoice_date > addDays(today, 1)) {
    warnings.push({ severity: 'warn', field: 'invoice_date', message: 'Invoice date is in the future. Is the day and month the right way round?' });
  } else if (daysBetween(invoice_date, today) > 730) {
    warnings.push({ severity: 'warn', field: 'invoice_date', message: 'Invoice date is more than 2 years old. Please check the year.' });
  }

  let due_date = raw.due_date;
  let due_date_source: CleanInvoice['due_date_source'] = null;
  if (due_date && !isRealDate(due_date)) {
    warnings.push({ severity: 'warn', field: 'due_date', message: `"${due_date}" is not a real date, so it was ignored.` });
    due_date = null;
  }
  if (due_date) {
    due_date_source = 'printed';
    if (invoice_date && due_date < invoice_date) {
      // An error, not a warning: the database refuses it (a CHECK rule), so Save would fail anyway.
      // Better to say so here, where staff can fix it, than after they press Save.
      warnings.push({ severity: 'error', field: 'due_date', message: 'Due date is before the invoice date, so it cannot be saved. Please correct one of the two dates.' });
    }
  } else if (invoice_date && raw.payment_terms_days != null && raw.payment_terms_days >= 0) {
    due_date = addDays(invoice_date, Math.round(raw.payment_terms_days));
    due_date_source = 'calculated_from_terms';
    warnings.push({
      severity: 'warn',
      field: 'due_date',
      message: `No due date is printed. Calculated from the invoice terms (${raw.payment_terms_days} days).`,
    });
  } else {
    warnings.push({
      severity: 'warn',
      field: 'due_date',
      message: "No due date or payment terms are printed. The vendor's usual credit days will be used when saving.",
    });
  }

  // ---- line items -------------------------------------------------------
  const line_items = raw.line_items.map((li) => ({
    item_name: li.item_name.trim(),
    quantity: li.quantity,
    unit: li.unit?.trim().toLowerCase() || DEFAULT_UNIT,
    unit_price: li.unit_price != null ? round2(li.unit_price) : null,
    line_total: li.line_total != null ? round2(li.line_total) : null,
  }));

  if (line_items.length === 0) {
    warnings.push({ severity: 'error', field: 'line_items', message: 'No item lines were found.' });
  }

  line_items.forEach((li, i) => {
    const field = `line_items[${i}]`;
    if (!li.item_name) warnings.push({ severity: 'error', field, message: `Line ${i + 1}: item name is missing.` });
    if (li.quantity == null || li.quantity <= 0) {
      warnings.push({ severity: 'error', field, message: `Line ${i + 1} (${li.item_name}): quantity is missing.` });
    }
    if (!raw.line_items[i].unit?.trim()) {
      // only a warning: the line is saved with the default unit, and staff can type kg, box, bag... if they know it
      warnings.push({
        severity: 'warn',
        field,
        message: `Line ${i + 1} (${li.item_name}): no unit is shown on the invoice, so "${DEFAULT_UNIT}" will be used. Change it if it is kg, box, bag...`,
      });
    }
    if (li.unit_price == null) {
      warnings.push({ severity: 'error', field, message: `Line ${i + 1} (${li.item_name}): price is missing.` });
    }
    // The database only takes amounts of zero or more, so a negative price or line amount (a discount line,
    // a credit note) would be refused at Save. Say so here instead.
    if ((li.unit_price ?? 0) < 0 || (li.line_total ?? 0) < 0) {
      warnings.push({
        severity: 'error',
        field,
        message: `Line ${i + 1} (${li.item_name}): a negative amount (a discount line or a credit note) cannot be saved in this version.`,
      });
    }
    // Fill a missing line total from quantity x price
    if (li.line_total == null && li.quantity != null && li.unit_price != null) {
      li.line_total = round2(li.quantity * li.unit_price);
    }
    // quantity x price should match the line amount (allow rounding of up to Rs 1 or 0.5%)
    if (li.quantity != null && li.unit_price != null && li.line_total != null) {
      const expected = li.quantity * li.unit_price;
      const tolerance = Math.max(1, Math.abs(li.line_total) * 0.005);
      if (Math.abs(expected - li.line_total) > tolerance) {
        warnings.push({
          severity: 'warn',
          field,
          message: `Line ${i + 1} (${li.item_name}): ${li.quantity} x ${li.unit_price} = ${round2(expected)}, but the invoice line says ${li.line_total}. One of the three numbers may be misread.`,
        });
      }
    }
  });

  // ---- totals -----------------------------------------------------------
  const linesSum = round2(line_items.reduce((sum, li) => sum + (li.line_total ?? 0), 0));
  let subtotal = raw.subtotal != null ? round2(raw.subtotal) : null;
  if (subtotal == null && line_items.length > 0) {
    subtotal = linesSum;
    warnings.push({ severity: 'warn', field: 'subtotal', message: 'Sub total was not found. It was calculated from the item lines.' });
  } else if (subtotal != null && line_items.length > 0 && Math.abs(subtotal - linesSum) > 1) {
    warnings.push({
      severity: 'warn',
      field: 'subtotal',
      message: `Item lines add up to ${linesSum}, but the sub total says ${subtotal}. A line may be missing or misread.`,
    });
  }

  const cgst = round2(raw.cgst ?? 0);
  const sgst = round2(raw.sgst ?? 0);
  const igst = round2(raw.igst ?? 0);
  if (igst > 0 && (cgst > 0 || sgst > 0)) {
    warnings.push({ severity: 'warn', field: 'igst', message: 'Both IGST and CGST/SGST were read. An invoice normally has only one kind. Please check.' });
  }
  if (Math.abs(cgst - sgst) > 0.05) {
    warnings.push({ severity: 'warn', field: 'sgst', message: `CGST (${cgst}) and SGST (${sgst}) are normally equal. Please check.` });
  }

  let total_amount = raw.total_amount != null ? round2(raw.total_amount) : null;
  if (total_amount == null) {
    if (subtotal != null) {
      total_amount = round2(subtotal + cgst + sgst + igst);
      warnings.push({ severity: 'error', field: 'total_amount', message: `Total was not found. Calculated ${total_amount} from sub total + taxes. Please confirm it.` });
    } else {
      warnings.push({ severity: 'error', field: 'total_amount', message: 'Total amount was not found. Please enter it.' });
    }
  } else if (subtotal != null) {
    const expectedTotal = round2(subtotal + cgst + sgst + igst);
    // invoices are often rounded to the nearest rupee, so allow a difference of up to Rs 1.50.
    // Not for a foreign invoice: its tax (for example a US sales tax) has no place in CGST/SGST/IGST, so
    // "a number may be misread" would be misleading. The currency error already explains the real problem.
    if (!foreignCurrency && Math.abs(total_amount - expectedTotal) > 1.5) {
      warnings.push({
        severity: 'warn',
        field: 'total_amount',
        message: `Sub total ${subtotal} + taxes ${round2(cgst + sgst + igst)} = ${expectedTotal}, but the invoice total says ${total_amount}. A number may be misread.`,
      });
    }
  }

  // ---- negative amounts (credit notes) ------------------------------------
  if ([subtotal, cgst, sgst, igst, total_amount].some((n) => n != null && n < 0)) {
    warnings.push({
      severity: 'error',
      field: 'total_amount',
      message: 'An amount below zero (for example a credit note) cannot be saved in this version.',
    });
  }

  // ---- no invoice number ------------------------------------------------
  // Many small shops hand out cash memos without a number. That must not stop staff from saving, so a
  // reference is made from the date and the total. Two memos with the same date and total from the same
  // vendor get the same reference, so the duplicate check still catches them.
  if (!invoice_number) {
    if (invoice_date && total_amount != null) {
      invoice_number = `NO-NUMBER-${invoice_date}-${total_amount}`;
      warnings.push({
        severity: 'warn',
        field: 'invoice_number',
        message: `No invoice number is printed, so "${invoice_number}" will be used as the reference. Type the real number if you know it.`,
      });
    } else {
      warnings.push({ severity: 'error', field: 'invoice_number', message: 'Invoice number was not found. Please type it.' });
    }
  }

  // ---- fields the AI itself said it was unsure about --------------------
  if (raw.unclear_fields.length > 0) {
    warnings.push({
      severity: 'warn',
      field: 'unclear_fields',
      message: `The AI was not sure about: ${raw.unclear_fields.join(', ')}. Please compare with the photo.`,
    });
  }

  return {
    invoice: {
      vendor_name,
      vendor_gstin,
      invoice_number,
      invoice_date,
      due_date,
      due_date_source,
      payment_terms_days: raw.payment_terms_days != null && raw.payment_terms_days >= 0 ? Math.round(raw.payment_terms_days) : null,
      currency,
      line_items,
      subtotal,
      cgst,
      sgst,
      igst,
      total_amount,
    },
    warnings,
  };
}
