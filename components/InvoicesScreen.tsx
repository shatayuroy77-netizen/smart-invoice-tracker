'use client';

// The Invoices tab: every saved invoice, with search and filters.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDate, formatINR } from '@/lib/format';
import type { InvoiceListRow } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { Badge, Card, EmptyState, ErrorBox, FLAG_LABELS, Loading } from './ui';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
  { id: 'flagged', label: 'Flagged' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export function StatusBadge({ status }: { status: InvoiceListRow['status_label'] }) {
  const tone = status === 'Paid' ? 'green' : status === 'Overdue' ? 'red' : 'slate';
  return <Badge tone={tone}>{status}</Badge>;
}

export function InvoicesScreen() {
  const [text, setText] = useState('');
  const [search, setSearch] = useState(''); // the text, after the person stopped typing for a moment
  const [filter, setFilter] = useState<FilterId>('all');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (filter === 'flagged') params.set('flagged', '1');
  else if (filter !== 'all') params.set('status', filter);
  const { data, error, loading, reload } = useApi<{ invoices: InvoiceListRow[] }>(`/api/invoices?${params}`);

  const invoices = data?.invoices;

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search vendor or invoice number"
        aria-label="Search invoices"
        className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 outline-none focus:ring-2 focus:ring-teal-600"
      />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${
              filter === f.id ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {!invoices && !error && <Loading />}

      {invoices && (
        <>
          <p className="text-sm text-slate-600" aria-live="polite">
            {loading ? 'Updating...' : `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}${invoices.length === 300 ? ' (showing the latest 300)' : ''}`}
          </p>
          {invoices.length === 0 && <EmptyState title="No invoices found" hint="Try a different search or filter." />}
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
            {invoices.map((inv) => (
              <li key={inv.invoice_id}>
                <Link href={`/invoices/${inv.invoice_id}`} className="block">
                  <Card className="active:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{inv.vendor_name}</p>
                        <p className="truncate text-sm text-slate-600">{inv.invoice_number}</p>
                      </div>
                      <p className="shrink-0 text-lg font-bold">{formatINR(inv.total_amount)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <StatusBadge status={inv.status_label} />
                      <span>{formatDate(inv.invoice_date)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Due {formatDate(inv.due_date)}</span>
                    </div>
                    {inv.flag_types && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {inv.flag_types.split(', ').map((type) => (
                          <Badge key={type} tone={FLAG_LABELS[type]?.tone ?? 'amber'}>
                            {FLAG_LABELS[type]?.label ?? type}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
