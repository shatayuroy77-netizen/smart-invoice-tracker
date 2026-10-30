// Indian formats: rupees with lakh/crore grouping, and dates as DD-MM-YYYY.
// The database and the API always use YYYY-MM-DD; these helpers are only for what people see and type.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

// 123456.5 -> "₹1,23,456.50"
export function formatINR(value: number | string | null | undefined, whole = false): string {
  const n = Number(value ?? 0);
  return (whole ? inrWhole : inr).format(Number.isFinite(n) ? n : 0);
}

// 1500 -> "1,500"  (quantities)
export function formatNumber(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return plain.format(Number.isFinite(n) ? n : 0);
}

// "2026-10-27" -> "27-10-2026". Plain text slicing, so time zones can never shift the day.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

// What the staff types: "27-10-2026", "27/10/2026" or "27.10.2026"  ->  "2026-10-27" (or null when it is not a real date)
export function parseDMY(text: string): string | null {
  const m = /^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// "Overdue by 3 days", "Due today", "Due in 5 days"
export function dueLabel(daysUntilDue: number): string {
  if (daysUntilDue < 0) return `Overdue by ${-daysUntilDue} day${daysUntilDue === -1 ? '' : 's'}`;
  if (daysUntilDue === 0) return 'Due today';
  return `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;
}
