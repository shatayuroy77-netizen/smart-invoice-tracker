// The supplier scorecard on the Prices tab, kept simple: two short ranked lists, one line per supplier.
//   1) who raised prices the most   2) who charges more than the others
// Tap a line to open the details. The numbers come from the SQL view v_vendor_scorecard
// (database/06_vendor_scorecard_and_cashflow.sql). A supplier with too little data behind a number
// is left out of that list (the view gives it no rank), so a weak percentage never looks like a fact.
import type { ReactNode } from 'react';
import { formatINR } from '@/lib/format';
import type { VendorScorecardRow } from '@/lib/types';
import { Card } from './ui';

const signed = (value: number | string | null): string => (value == null ? '-' : `${Number(value) > 0 ? '+' : ''}${Number(value)}%`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A bigger average price rise gets a stronger colour.
function trendColour(avg: number): string {
  if (avg >= 3) return 'text-red-700';
  if (avg >= 1) return 'text-amber-800';
  if (avg < 0) return 'text-emerald-700';
  return '';
}

// One line (rank, name, one number) that opens to show the details.
function Row(props: { rank: number; name: string; value: string; valueClass: string; children: ReactNode }) {
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <span
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                props.rank === 1 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {props.rank}
            </span>
            <span className="truncate font-semibold">{props.name}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className={`text-lg font-bold ${props.valueClass}`}>{props.value}</span>
            <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-90">
              ›
            </span>
          </span>
        </summary>
        <div className="space-y-1 pb-3 pl-10 text-sm text-slate-600">{props.children}</div>
      </details>
    </li>
  );
}

export function VendorScorecard({ vendors }: { vendors: VendorScorecardRow[] }) {
  if (vendors.length === 0) return null;

  // the API already sends them best-ranked first; sort again so this component never depends on that
  const risers = vendors.filter((v) => v.price_rise_rank != null).sort((a, b) => Number(a.price_rise_rank) - Number(b.price_rise_rank));
  const pricey = vendors.filter((v) => v.price_level_rank != null).sort((a, b) => Number(a.price_level_rank) - Number(b.price_level_rank));
  const leftOut = vendors.length - risers.length;

  return (
    <section aria-label="Supplier scorecard" className="space-y-4">
      <h2 className="font-semibold">Supplier scorecard</h2>

      <Card>
        <h3 className="font-semibold">Who raised prices the most?</h3>
        <p className="mt-0.5 text-xs text-slate-600">
          Each time you buy the same item again from the same supplier, we compare the price with last time. This is the average. Tap a line for details.
        </p>
        {risers.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">Not enough repeat purchases yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {risers.map((v) => (
              <Row
                key={v.vendor_id}
                rank={Number(v.price_rise_rank)}
                name={v.vendor_name}
                value={signed(v.avg_price_change_pct)}
                valueClass={trendColour(Number(v.avg_price_change_pct))}
              >
                <p>Average over {plural(v.price_comparisons, 'repeat purchase')}.</p>
                <p>
                  Biggest single rise {signed(v.biggest_jump_pct)} ·{' '}
                  {v.price_jumps === 0 ? 'no rise above 10%' : `${plural(v.price_jumps, 'rise')} above 10%`}.
                </p>
                <p>
                  {plural(v.invoices, 'invoice')} · {formatINR(v.spend_before_tax, true)} before tax.
                </p>
                {v.shared_items > 0 && !v.enough_comparison_data && (
                  <p>
                    On {plural(v.shared_items, 'item')} that another supplier also sells it charges {signed(v.avg_pct_above_cheapest)} more than the cheapest, but that is too little data to rank.
                  </p>
                )}
              </Row>
            ))}
          </ul>
        )}
        {leftOut > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {plural(leftOut, 'supplier')} left out: fewer than 5 repeat purchases, too little to compare.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold">Who charges more than the others?</h3>
        <p className="mt-0.5 text-xs text-slate-600">
          For items that two or more suppliers sell: how much more this supplier charges than the cheapest one, on average. Only suppliers that share at least 3 items are compared.
        </p>
        {pricey.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No supplier shares enough items with another supplier yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {pricey.map((v) => (
              <Row
                key={v.vendor_id}
                rank={Number(v.price_level_rank)}
                name={v.vendor_name}
                value={signed(v.avg_pct_above_cheapest)}
                valueClass={Number(v.avg_pct_above_cheapest) >= 5 ? 'text-amber-800' : ''}
              >
                <p>Compared on {plural(v.shared_items, 'shared item')}.</p>
                <p>Cheapest supplier on {v.times_cheapest} of them.</p>
              </Row>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
