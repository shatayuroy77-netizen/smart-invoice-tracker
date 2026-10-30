'use client';

// The Payments tab: how much is due, what is overdue, and the "Mark as paid" button.
import Link from 'next/link';
import { useState } from 'react';
import { dueLabel, formatDate, formatINR } from '@/lib/format';
import type { CashflowWeekRow, PaymentRow, PaymentsSummary } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { CashflowChart } from './CashflowChart';
import { Badge, btn, Card, EmptyState, ErrorBox, Loading } from './ui';

type FilterId = 'all' | 'overdue' | '7' | '15' | '30';

function matches(filter: FilterId, days: number): boolean {
  if (filter === 'all') return true;
  if (filter === 'overdue') return days < 0;
  return days >= 0 && days <= Number(filter);
}

function Tile(props: { label: string; amount: number; count: number; tone: 'red' | 'slate'; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      aria-pressed={props.active}
      className={`rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.98] ${
        props.active ? 'border-teal-600 ring-2 ring-teal-600' : 'border-slate-200'
      } ${props.tone === 'red' ? 'bg-red-50' : 'bg-white'}`}
    >
      <span className={`block text-xs font-semibold ${props.tone === 'red' ? 'text-red-800' : 'text-slate-600'}`}>{props.label}</span>
      <span className={`mt-1 block text-xl font-bold ${props.tone === 'red' ? 'text-red-800' : ''}`}>{formatINR(props.amount, true)}</span>
      <span className="block text-xs text-slate-600">
        {props.count} invoice{props.count === 1 ? '' : 's'}
      </span>
    </button>
  );
}

export function PaymentsScreen() {
  const { data, error, loading, reload } = useApi<{ summary: PaymentsSummary; invoices: PaymentRow[]; weekly: CashflowWeekRow[] }>('/api/payments');
  const [filter, setFilter] = useState<FilterId>('all');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function markPaid(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/invoices/${id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: true }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok || !out?.ok) setActionError(out?.error ?? 'Could not mark the invoice as paid.');
      else reload();
    } catch {
      setActionError('Could not reach the server.');
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const { summary: s, invoices } = data;
  const shown = invoices.filter((inv) => matches(filter, inv.days_until_due));

  // group by bucket, keeping the order the view gave us (overdue first)
  const groups: { bucket: string; rows: PaymentRow[] }[] = [];
  for (const inv of shown) {
    const last = groups[groups.length - 1];
    if (last && last.bucket === inv.due_bucket) last.rows.push(inv);
    else groups.push({ bucket: inv.due_bucket, rows: [inv] });
  }

  const toggle = (id: FilterId) => setFilter((f) => (f === id ? 'all' : id));

  return (
    <div className={`space-y-4 ${loading ? 'opacity-70' : ''}`}>
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Overdue" amount={s.overdue_amount} count={s.overdue_invoices} tone="red" active={filter === 'overdue'} onClick={() => toggle('overdue')} />
        <Tile label="Due in next 7 days" amount={s.due_7_days_amount} count={s.due_7_days_invoices} tone="slate" active={filter === '7'} onClick={() => toggle('7')} />
        <Tile label="Due in next 15 days" amount={s.due_15_days_amount} count={s.due_15_days_invoices} tone="slate" active={filter === '15'} onClick={() => toggle('15')} />
        <Tile label="Due in next 30 days" amount={s.due_30_days_amount} count={s.due_30_days_invoices} tone="slate" active={filter === '30'} onClick={() => toggle('30')} />
      </div>
      <p className="text-xs text-slate-500">The 7, 15 and 30 day totals include everything due from today up to that many days. Tap a box to filter the list.</p>

      {Number(s.possible_duplicate_amount) > 0 && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <b>{formatINR(s.possible_duplicate_amount, true)}</b> of the unpaid amount belongs to possible duplicate invoices. Check them before paying.
        </div>
      )}

      <CashflowChart weeks={data.weekly ?? []} />

      {actionError && <ErrorBox message={actionError} />}

      {shown.length === 0 && (
        <EmptyState title={invoices.length === 0 ? 'Nothing to pay. All invoices are paid.' : 'No invoices in this group'} hint={filter !== 'all' ? 'Tap the box again to see everything.' : undefined} />
      )}

      {groups.map((group) => (
        <section key={group.bucket} aria-label={group.bucket}>
          <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${group.bucket === 'Overdue' ? 'text-red-700' : 'text-slate-600'}`}>
            {group.bucket} · {group.rows.length}
          </h2>
          <ul className="space-y-3">
            {group.rows.map((inv) => (
              <li key={inv.invoice_id}>
                <Card>
                  <Link href={`/invoices/${inv.invoice_id}`} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{inv.vendor_name}</p>
                        <p className="truncate text-sm text-slate-600">{inv.invoice_number}</p>
                      </div>
                      <p className="shrink-0 text-lg font-bold">{formatINR(inv.total_amount)}</p>
                    </div>
                    <p className={`mt-1 text-sm ${inv.days_until_due < 0 ? 'font-semibold text-red-700' : 'text-slate-600'}`}>
                      {dueLabel(inv.days_until_due)} · {formatDate(inv.due_date)}
                    </p>
                    {inv.is_possible_duplicate && (
                      <div className="mt-2">
                        <Badge tone="red">Possible duplicate: check before paying</Badge>
                      </div>
                    )}
                  </Link>
                  <div className="mt-3">
                    {confirmId === inv.invoice_id ? (
                      <div className="grid grid-cols-2 gap-3">
                        <button className={btn('secondary')} disabled={busyId === inv.invoice_id} onClick={() => setConfirmId(null)}>
                          Cancel
                        </button>
                        <button className={btn('primary')} disabled={busyId === inv.invoice_id} onClick={() => void markPaid(inv.invoice_id)}>
                          {busyId === inv.invoice_id ? 'Saving...' : 'Yes, paid'}
                        </button>
                      </div>
                    ) : (
                      <button className={btn('secondary', true)} onClick={() => setConfirmId(inv.invoice_id)}>
                        Mark as paid
                      </button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
