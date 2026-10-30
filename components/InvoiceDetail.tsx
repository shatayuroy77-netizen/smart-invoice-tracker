'use client';

// One invoice: details, items, flags, photo and the "Mark as paid" button.
import Link from 'next/link';
import { useState } from 'react';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import type { InvoiceDetail as Detail } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { StatusBadge } from './InvoicesScreen';
import { Badge, btn, Card, ErrorBox, FLAG_LABELS, Loading } from './ui';

export function InvoiceDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useApi<{ ok: true } & Detail>(`/api/invoices/${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function setPaid(paid: boolean) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/invoices/${id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid }),
      });
      const out = await res.json().catch(() => null);
      if (!res.ok || !out?.ok) setActionError(out?.error ?? 'Could not update the invoice.');
      else reload();
    } catch {
      setActionError('Could not reach the server.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <Link href="/invoices" className="text-sm font-semibold text-teal-800">
          ← All invoices
        </Link>
        <ErrorBox message={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return <Loading />;

  const { invoice: inv, items, flags, photo_url } = data;
  const tax = Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst);

  return (
    <div className={`space-y-4 ${loading ? 'opacity-70' : ''}`}>
      <Link href="/invoices" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800">
        ← All invoices
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{inv.vendor_name}</h1>
            <p className="text-slate-600">{inv.invoice_number}</p>
            <p className="mt-1 text-xs text-slate-500">GSTIN: {inv.vendor_gstin ?? 'not recorded'}</p>
          </div>
          <StatusBadge status={inv.status_label} />
        </div>
        <p className="mt-3 text-3xl font-bold">{formatINR(inv.total_amount)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">Invoice date</dt>
            <dd className="font-medium">{formatDate(inv.invoice_date)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Due date</dt>
            <dd className="font-medium">{formatDate(inv.due_date)}</dd>
          </div>
          {inv.paid_on && (
            <div>
              <dt className="text-slate-500">Paid on</dt>
              <dd className="font-medium">{formatDate(inv.paid_on)}</dd>
            </div>
          )}
        </dl>
      </Card>

      {flags.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <h2 className="font-semibold">Needs attention</h2>
          <ul className="mt-2 space-y-2">
            {flags.map((flag, i) => (
              <li key={i} className="text-sm">
                <Badge tone={FLAG_LABELS[flag.flag_type]?.tone ?? 'amber'}>{FLAG_LABELS[flag.flag_type]?.label ?? flag.flag_type}</Badge>
                <span className="mt-1 block text-slate-800">{flag.flag_detail}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Items ({items.length})</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{item.item_name}</p>
                <p className="text-slate-600">
                  {formatNumber(item.quantity)} {item.unit} × {formatINR(item.unit_price)}
                </p>
              </div>
              <p className="shrink-0 font-semibold">{formatINR(item.line_total)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Sub total</dt>
            <dd>{formatINR(inv.subtotal)}</dd>
          </div>
          {Number(inv.cgst) > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-600">CGST</dt>
              <dd>{formatINR(inv.cgst)}</dd>
            </div>
          )}
          {Number(inv.sgst) > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-600">SGST</dt>
              <dd>{formatINR(inv.sgst)}</dd>
            </div>
          )}
          {Number(inv.igst) > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-600">IGST</dt>
              <dd>{formatINR(inv.igst)}</dd>
            </div>
          )}
          {tax === 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-600">Tax</dt>
              <dd>{formatINR(0)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <dt>Total</dt>
            <dd>{formatINR(inv.total_amount)}</dd>
          </div>
        </dl>
      </Card>

      {photo_url && (
        <Card>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">Invoice photo</summary>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo_url} alt="Photo of the invoice" className="mt-2 w-full rounded-lg border border-slate-200" />
          </details>
        </Card>
      )}

      {actionError && <ErrorBox message={actionError} />}

      {inv.payment_status === 'unpaid' ? (
        confirming ? (
          <Card className="space-y-3">
            <p className="font-semibold">Mark {formatINR(inv.total_amount)} to {inv.vendor_name} as paid today?</p>
            <div className="grid grid-cols-2 gap-3">
              <button className={btn('secondary')} disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className={btn('primary')} disabled={busy} onClick={() => void setPaid(true)}>
                {busy ? 'Saving...' : 'Yes, paid'}
              </button>
            </div>
          </Card>
        ) : (
          <button className={btn('primary', true)} onClick={() => setConfirming(true)}>
            Mark as paid
          </button>
        )
      ) : (
        <button className={btn('secondary', true)} disabled={busy} onClick={() => void setPaid(false)}>
          {busy ? 'Saving...' : 'Undo: mark as unpaid'}
        </button>
      )}
    </div>
  );
}
