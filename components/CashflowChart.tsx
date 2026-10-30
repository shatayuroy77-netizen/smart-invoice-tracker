// "Money to pay, week by week" on the Payments tab. One bar per week for the next 8 weeks,
// plus Overdue (and Later, only when something is that far away).
// The numbers come from the SQL view v_cashflow_weekly (database/06_vendor_scorecard_and_cashflow.sql).
import { formatDate, formatINR } from '@/lib/format';
import type { CashflowWeekRow } from '@/lib/types';
import { Card } from './ui';

// "2026-11-05" -> "05-11"
const short = (iso: string | null) => (iso ? formatDate(iso).slice(0, 5) : '');

function describe(w: CashflowWeekRow): { title: string; dates: string } {
  if (w.week_no === -1) return { title: 'Overdue', dates: 'due date already passed' };
  if (w.week_no === 8) return { title: 'Later', dates: `from ${short(w.starts_on)} onwards` };
  const title = w.week_no === 0 ? 'This week' : w.week_no === 1 ? 'Next week' : `In ${w.week_no} weeks`;
  return { title, dates: `${short(w.starts_on)} to ${short(w.ends_on)}` };
}

export function CashflowChart({ weeks }: { weeks: CashflowWeekRow[] }) {
  const total = weeks.length > 0 ? Number(weeks[weeks.length - 1].running_total) : 0;
  if (total === 0) return null; // nothing unpaid: the screen already says so

  // always show the 8 weeks (so the chart has no gaps); Overdue and Later only when they hold money
  const rows = weeks.filter((w) => (w.week_no >= 0 && w.week_no <= 7) || Number(w.amount) > 0);
  const biggest = Math.max(...rows.map((w) => Number(w.amount)), 1);

  return (
    <Card>
      <h2 className="font-semibold">Money to pay, week by week</h2>
      <p className="mt-0.5 text-xs text-slate-600">
        The next 8 weeks, starting today. The running total is the cash you need if you pay everything due so far, including what is overdue.
      </p>
      <ul className="mt-2 divide-y divide-slate-100">
        {rows.map((w) => {
          const { title, dates } = describe(w);
          const amount = Number(w.amount);
          const overdue = w.week_no === -1;
          const duplicates = Number(w.possible_duplicate_amount);
          return (
            <li key={w.week_no} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{title}</p>
                  <p className="text-xs text-slate-600">{dates}</p>
                </div>
                <p className={`shrink-0 font-bold ${overdue && amount > 0 ? 'text-red-700' : amount === 0 ? 'text-slate-400' : ''}`}>
                  {amount > 0 ? formatINR(amount, true) : '-'}
                </p>
              </div>
              <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${overdue ? 'bg-red-500' : 'bg-teal-600'}`}
                  style={{ width: amount > 0 ? `${Math.max(2, (amount / biggest) * 100)}%` : '0%' }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {w.invoices === 0 ? 'nothing due' : `${w.invoices} invoice${w.invoices === 1 ? '' : 's'}`} · running total {formatINR(w.running_total, true)}
              </p>
              {duplicates > 0 && <p className="text-xs font-semibold text-red-700">{formatINR(duplicates, true)} of this may be duplicate invoices</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
