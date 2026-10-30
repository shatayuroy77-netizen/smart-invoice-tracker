'use client';

// The Prices tab: price alerts, and a comparison of the same item across vendors.
import Link from 'next/link';
import { useState } from 'react';
import { formatDate, formatINR } from '@/lib/format';
import type { PriceComparisonRow, PriceHistoryRow, PriceItemSummary, PriceJump } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { PriceChart, type ChartSeries } from './PriceChart';
import { Badge, btn, Card, EmptyState, ErrorBox, Loading } from './ui';

function ItemDetail({ item, onBack }: { item: PriceItemSummary; onBack: () => void }) {
  const url = `/api/prices/item?key=${encodeURIComponent(item.item_key)}&unit=${encodeURIComponent(item.unit)}`;
  const { data, error, reload } = useApi<{ comparison: PriceComparisonRow[]; history: PriceHistoryRow[] }>(url);

  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const { comparison, history } = data;
  const series: ChartSeries[] = comparison.map((c) => ({
    name: c.vendor_name,
    points: history.filter((h) => h.vendor_id === c.vendor_id).map((h) => ({ date: h.invoice_date, price: Number(h.unit_price) })),
  }));
  const multiple = comparison.length > 1;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800">
        ← All items
      </button>
      <div>
        <h2 className="text-xl font-bold">{item.item_name}</h2>
        <p className="text-sm text-slate-600">
          Price per {item.unit}, before tax · {comparison.length} vendor{comparison.length === 1 ? '' : 's'}
        </p>
      </div>

      <Card>
        <h3 className="mb-2 font-semibold">{multiple ? 'Who is cheapest right now' : 'Latest price'}</h3>
        <ul className="divide-y divide-slate-100">
          {comparison.map((c) => (
            <li key={c.vendor_id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{c.vendor_name}</p>
                  <p className="text-xs text-slate-600">
                    Bought {c.times_bought}× · last on {formatDate(c.last_bought_on)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold">{formatINR(c.latest_price)}</p>
                  {multiple &&
                    (c.is_cheapest ? <Badge tone="green">Cheapest</Badge> : <Badge tone={Number(c.pct_above_cheapest) >= 5 ? 'amber' : 'slate'}>+{c.pct_above_cheapest}% vs cheapest</Badge>)}
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Average {formatINR(c.avg_price)} · lowest {formatINR(c.lowest_price)} · highest {formatINR(c.highest_price)}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-2 font-semibold">Price over time</h3>
        <PriceChart series={series} label={`Price of ${item.item_name} over time, per vendor`} />
      </Card>

      <Card>
        <h3 className="mb-2 font-semibold">Every purchase</h3>
        <ul className="divide-y divide-slate-100 text-sm">
          {[...history].reverse().map((h, i) => (
            <li key={`${h.invoice_id}-${i}`} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{h.vendor_name}</p>
                <p className="text-xs text-slate-600">
                  {formatDate(h.invoice_date)} ·{' '}
                  <Link href={`/invoices/${h.invoice_id}`} className="underline">
                    {h.invoice_number}
                  </Link>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold">{formatINR(h.unit_price)}</p>
                {h.price_change_pct != null && Number(h.price_change_pct) !== 0 && (
                  <p className={`text-xs ${Number(h.price_change_pct) > 10 ? 'font-bold text-red-700' : Number(h.price_change_pct) > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                    {Number(h.price_change_pct) > 0 ? '+' : ''}
                    {h.price_change_pct}%
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function PricesScreen() {
  const { data, error, reload } = useApi<{ jumps: PriceJump[]; items: PriceItemSummary[] }>('/api/prices');
  const [selected, setSelected] = useState<PriceItemSummary | null>(null);
  const [text, setText] = useState('');

  if (selected) return <ItemDetail item={selected} onBack={() => setSelected(null)} />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const needle = text.trim().toLowerCase();
  const items = needle ? data.items.filter((i) => i.item_key.includes(needle)) : data.items;

  return (
    <div className="space-y-5">
      <section aria-label="Price alerts">
        <h2 className="mb-2 font-semibold">Price alerts</h2>
        {data.jumps.length === 0 ? (
          <EmptyState title="No unusual price increases" hint="You are told when a vendor raises a price by more than 10%." />
        ) : (
          <ul className="space-y-3">
            {data.jumps.map((j) => (
              <li key={`${j.invoice_id}-${j.item_key}`}>
                <Link href={`/invoices/${j.invoice_id}`} className="block">
                  <Card className="border-amber-300 bg-amber-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{j.item_name}</p>
                        <p className="truncate text-sm text-slate-700">{j.vendor_name}</p>
                      </div>
                      <Badge tone="red">+{j.price_change_pct}%</Badge>
                    </div>
                    <p className="mt-1 text-sm">
                      {formatINR(j.previous_price)} → <b>{formatINR(j.unit_price)}</b> per {j.unit}
                    </p>
                    <p className="text-xs text-slate-600">
                      Invoice {j.invoice_number} · {formatDate(j.invoice_date)}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Compare an item">
        <h2 className="mb-2 font-semibold">Compare an item</h2>
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search an item, e.g. sugar"
          aria-label="Search items"
          className="mb-3 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 outline-none focus:ring-2 focus:ring-teal-600"
        />
        {items.length === 0 ? (
          <EmptyState title="No items found" />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={`${item.item_key}|${item.unit}`}>
                <button onClick={() => setSelected(item)} className={`${btn('secondary', true)} !justify-between !rounded-2xl text-left`}>
                  <span className="min-w-0 truncate">{item.item_name}</span>
                  <span className="shrink-0 text-sm font-normal text-slate-600">
                    per {item.unit} · {item.vendors_selling_it} vendor{item.vendors_selling_it === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
