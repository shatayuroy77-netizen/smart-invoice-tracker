// The rules an invoice must follow before it may be saved. The screen checks the same things,
// but the server never trusts the screen: it re-checks everything here.
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD');
const money = z.number().min(0).max(1_000_000_000);

export const SaveInvoiceSchema = z.object({
  vendor_name: z.string().trim().min(1, 'Vendor name is required').max(200),
  vendor_gstin: z.string().trim().max(20).nullable(),
  invoice_number: z.string().trim().min(1, 'Invoice number is required').max(100),
  invoice_date: isoDate,
  due_date: isoDate.nullable(),
  payment_terms_days: z.number().int().min(0).max(365).nullable(),
  line_items: z
    .array(
      z.object({
        item_name: z.string().trim().min(1, 'Every item needs a name').max(200),
        quantity: z.number().positive().max(10_000_000),
        unit: z.string().trim().min(1, 'Every item needs a unit').max(30),
        unit_price: money,
        line_total: money,
      }),
    )
    .min(1, 'At least one item is required')
    .max(200),
  subtotal: money,
  cgst: money,
  sgst: money,
  igst: money,
  total_amount: money,
  // true only after staff saw the "possible duplicate" warning and chose to save anyway
  allow_duplicate: z.boolean().default(false),
});

export type SaveInvoiceInput = z.infer<typeof SaveInvoiceSchema>;
