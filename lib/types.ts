// The shapes of the data the API routes send to the screens.
// They mirror the columns of the SQL views (database/04_views.sql).

export interface InvoiceListRow {
  invoice_id: string;
  vendor_name: string;
  vendor_gstin: string | null;
  invoice_number: string;
  invoice_date: string; // YYYY-MM-DD
  due_date: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_amount: number;
  payment_status: 'paid' | 'unpaid';
  paid_on: string | null;
  image_path: string | null;
  status_label: 'Paid' | 'Overdue' | 'Unpaid';
  flag_count: number;
  flag_types: string | null; // e.g. 'BAD_GSTIN, DUPLICATE'
}

export interface ItemRow {
  id: string;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
}

export interface FlagRow {
  flag_type: 'DUPLICATE' | 'PRICE_JUMP' | 'BAD_GSTIN';
  flag_detail: string;
}

export interface InvoiceDetail {
  invoice: InvoiceListRow;
  items: ItemRow[];
  flags: FlagRow[];
  photo_url: string | null;
}

export interface PaymentRow {
  invoice_id: string;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  days_until_due: number;
  due_bucket: string;
  bucket_order: number;
  is_possible_duplicate: boolean;
}

export interface PaymentsSummary {
  unpaid_invoices: number;
  unpaid_total: number;
  overdue_invoices: number;
  overdue_amount: number;
  due_7_days_invoices: number;
  due_7_days_amount: number;
  due_15_days_invoices: number;
  due_15_days_amount: number;
  due_30_days_invoices: number;
  due_30_days_amount: number;
  possible_duplicate_amount: number;
}

export interface PriceJump {
  invoice_id: string;
  invoice_number: string;
  vendor_name: string;
  invoice_date: string;
  item_name: string;
  item_key: string;
  unit: string;
  previous_price: number;
  unit_price: number;
  price_change_pct: number;
}

export interface PriceComparisonRow {
  item_key: string;
  item_name: string;
  unit: string;
  vendor_id: string;
  vendor_name: string;
  times_bought: number;
  avg_price: number;
  lowest_price: number;
  highest_price: number;
  latest_price: number;
  last_bought_on: string;
  vendors_selling_it: number;
  cheapest_latest_price: number;
  pct_above_cheapest: number;
  is_cheapest: boolean;
}

export interface PriceHistoryRow {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  vendor_id: string;
  vendor_name: string;
  unit_price: number;
  previous_price: number | null;
  price_change_pct: number | null;
}

export interface PriceItemSummary {
  item_key: string;
  item_name: string;
  unit: string;
  vendors_selling_it: number;
}
