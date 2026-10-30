'use client';

// The Scan tab: photo -> AI reads it -> staff checks and fixes the fields -> Save.
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { checkInvoice, DEFAULT_UNIT, type CleanInvoice, type RawInvoice, type Warning } from '@/lib/invoice-checks';
import { formatDate, formatINR, parseDMY } from '@/lib/format';
import { shrinkImage } from '@/lib/shrink-image';
import { btn, Card, ErrorBox, Loading } from './ui';

// ---- the form (everything is text while the person is typing) ----------------------
interface LineForm {
  id: string;
  name: string;
  qty: string;
  unit: string;
  price: string;
  total: string;
}
interface Form {
  vendor_name: string;
  vendor_gstin: string;
  invoice_number: string;
  invoice_date: string; // DD-MM-YYYY as typed
  due_date: string;
  dueNote: string; // e.g. "Calculated from the invoice terms (30 days)"
  terms: number | null;
  lines: LineForm[];
  subtotal: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

interface DuplicateInfo {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  payment_status: string;
  reason: string;
}
interface SavedInfo {
  invoice_id: string;
  vendor_created: boolean;
  due_date: string;
  notice: string | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const str = (n: number | null | undefined) => (n == null ? '' : String(n));

function toNum(text: string): number | null {
  const t = text.replace(/[,\s₹]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// What was typed in a date box -> ISO date. Anything that is not a real date is passed on as
// typed, so the checks can say "not a real date".
function toDate(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  return parseDMY(t) ?? t;
}

function formFromScan(invoice: CleanInvoice, warnings: Warning[]): Form {
  const dueNote = warnings.find((w) => w.field === 'due_date')?.message ?? '';
  return {
    vendor_name: invoice.vendor_name ?? '',
    vendor_gstin: invoice.vendor_gstin ?? '',
    invoice_number: invoice.invoice_number ?? '',
    invoice_date: invoice.invoice_date ? formatDate(invoice.invoice_date) : '',
    due_date: invoice.due_date ? formatDate(invoice.due_date) : '',
    dueNote,
    terms: invoice.payment_terms_days,
    lines: invoice.line_items.map((li) => ({
      id: crypto.randomUUID(),
      name: li.item_name,
      qty: str(li.quantity),
      unit: li.unit ?? '',
      price: str(li.unit_price),
      total: str(li.line_total),
    })),
    subtotal: str(invoice.subtotal),
    cgst: str(invoice.cgst),
    sgst: str(invoice.sgst),
    igst: str(invoice.igst),
    total: str(invoice.total_amount),
  };
}

// A blank form, for typing an invoice in by hand (when the AI is not available or cannot read the paper).
function emptyForm(): Form {
  return {
    vendor_name: '',
    vendor_gstin: '',
    invoice_number: '',
    invoice_date: '',
    due_date: '',
    dueNote: '',
    terms: null,
    lines: [{ id: crypto.randomUUID(), name: '', qty: '', unit: '', price: '', total: '' }],
    subtotal: '',
    cgst: '',
    sgst: '',
    igst: '',
    total: '',
  };
}

function toRaw(form: Form): RawInvoice {
  return {
    vendor_name: form.vendor_name || null,
    vendor_gstin: form.vendor_gstin || null,
    invoice_number: form.invoice_number || null,
    invoice_date: toDate(form.invoice_date),
    due_date: toDate(form.due_date),
    payment_terms_days: form.terms,
    line_items: form.lines.map((l) => ({
      item_name: l.name,
      quantity: toNum(l.qty),
      unit: l.unit || null,
      unit_price: toNum(l.price),
      line_total: toNum(l.total),
    })),
    subtotal: toNum(form.subtotal),
    cgst: toNum(form.cgst),
    sgst: toNum(form.sgst),
    igst: toNum(form.igst),
    total_amount: toNum(form.total),
    unclear_fields: [],
  };
}

// ---- small input components --------------------------------------------------------
function Messages({ warnings }: { warnings?: Warning[] }) {
  if (!warnings?.length) return null;
  return (
    <>
      {warnings.map((w, i) => (
        <span key={i} className={`mt-1 block text-xs ${w.severity === 'error' ? 'text-red-700' : 'text-amber-800'}`}>
          {w.message}
        </span>
      ))}
    </>
  );
}

function ringFor(warnings?: Warning[]) {
  if (warnings?.some((w) => w.severity === 'error')) return 'border-red-400 bg-red-50';
  if (warnings?.length) return 'border-amber-400 bg-amber-50';
  return 'border-slate-300 bg-white';
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  warnings?: Warning[];
  hint?: string;
  inputMode?: 'decimal' | 'text';
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{props.label}</span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        autoComplete="off"
        className={`min-h-12 w-full rounded-xl border px-3 outline-none focus:ring-2 focus:ring-teal-600 ${ringFor(props.warnings)}`}
      />
      <Messages warnings={props.warnings} />
      {props.hint && !props.warnings?.length && <span className="mt-1 block text-xs text-slate-500">{props.hint}</span>}
    </label>
  );
}

function MiniField(props: { label: string; value: string; onChange: (v: string) => void; inputMode?: 'decimal' | 'text'; flagged?: boolean; placeholder?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-600">{props.label}</span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        autoComplete="off"
        className={`min-h-11 w-full min-w-0 rounded-lg border px-2 outline-none focus:ring-2 focus:ring-teal-600 ${
          props.flagged ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'
        }`}
      />
    </label>
  );
}

// ---- the screen ---------------------------------------------------------------------
type Stage = 'idle' | 'reading' | 'review' | 'saving' | 'saved';

export function ScanScreen() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [aiNotes, setAiNotes] = useState<Warning[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[] | null>(null);
  const [saved, setSaved] = useState<SavedInfo | null>(null);

  // The checks run again after every keystroke, so the messages always match what is on screen.
  const checked = useMemo(() => (form ? checkInvoice(toRaw(form)) : null), [form]);
  const warnings = useMemo(() => {
    const all = [...(checked?.warnings ?? [])];
    const unclear = aiNotes.find((w) => w.field === 'unclear_fields');
    if (unclear) all.push(unclear); // the AI's own doubts stay visible until the photo is replaced
    return all;
  }, [checked, aiNotes]);
  const byField = useMemo(() => {
    const map = new Map<string, Warning[]>();
    for (const w of warnings) map.set(w.field, [...(map.get(w.field) ?? []), w]);
    return map;
  }, [warnings]);
  const errorCount = warnings.filter((w) => w.severity === 'error').length;
  const warnCount = warnings.length - errorCount;

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStage('idle');
    setError(null);
    setPhoto(null);
    setPreviewUrl(null);
    setForm(null);
    setAiNotes([]);
    setDuplicates(null);
    setSaved(null);
  }

  async function readPhoto(original: File) {
    setError(null);
    setStage('reading');
    const small = await shrinkImage(original);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhoto(small);
    setPreviewUrl(URL.createObjectURL(small));

    try {
      const body = new FormData();
      body.append('image', small);
      const res = await fetch('/api/scan', { method: 'POST', body });
      const out = await res.json().catch(() => null);
      if (!res.ok || !out?.ok) {
        setError(out?.error ?? 'The invoice could not be read. Please try again.');
        setStage('idle');
        return;
      }
      setForm(formFromScan(out.invoice, out.warnings));
      setAiNotes((out.warnings as Warning[]).filter((w) => w.field === 'unclear_fields'));
      setStage('review');
    } catch {
      setError('Could not reach the server. Check your internet and try again.');
      setStage('idle');
    }
  }

  // No photo, no AI: the staff member types the invoice in. The same checks and the same Save are used.
  function startManual() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError(null);
    setPhoto(null);
    setPreviewUrl(null);
    setAiNotes([]);
    setDuplicates(null);
    setForm(emptyForm());
    setStage('review');
  }

  async function loadSample(url: string, name: string) {
    try {
      const blob = await (await fetch(url)).blob();
      await readPhoto(new File([blob], name, { type: 'image/jpeg' }));
    } catch {
      setError('The sample could not be loaded.');
    }
  }

  function setValue<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function updateLine(index: number, patch: Partial<LineForm>) {
    setForm((f) => {
      if (!f) return f;
      const lines = f.lines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        // When quantity or price changes and the line total was "quantity x price", keep it in step.
        if ('qty' in patch || 'price' in patch) {
          const [oldQ, oldP, oldT] = [toNum(line.qty), toNum(line.price), toNum(line.total)];
          const followed = oldT == null || (oldQ != null && oldP != null && Math.abs(oldQ * oldP - oldT) < 0.01);
          const [newQ, newP] = [toNum(next.qty), toNum(next.price)];
          if (followed && newQ != null && newP != null) next.total = String(round2(newQ * newP));
        }
        return next;
      });
      return { ...f, lines };
    });
  }

  function addLine() {
    setForm((f) => (f ? { ...f, lines: [...f.lines, { id: crypto.randomUUID(), name: '', qty: '', unit: '', price: '', total: '' }] } : f));
  }

  function removeLine(index: number) {
    setForm((f) => (f ? { ...f, lines: f.lines.filter((_, i) => i !== index) } : f));
  }

  function recalculateTotals() {
    setForm((f) => {
      if (!f) return f;
      const subtotal = round2(f.lines.reduce((sum, l) => sum + (toNum(l.total) ?? 0), 0));
      const tax = (toNum(f.cgst) ?? 0) + (toNum(f.sgst) ?? 0) + (toNum(f.igst) ?? 0);
      return { ...f, subtotal: String(subtotal), total: String(round2(subtotal + tax)) };
    });
  }

  async function save(allowDuplicate: boolean) {
    const invoice = checked?.invoice;
    if (!invoice || errorCount > 0) return;
    setError(null);
    setDuplicates(null);
    setStage('saving');

    const payload = {
      vendor_name: invoice.vendor_name,
      vendor_gstin: invoice.vendor_gstin,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      payment_terms_days: invoice.payment_terms_days,
      line_items: invoice.line_items,
      subtotal: invoice.subtotal,
      cgst: invoice.cgst,
      sgst: invoice.sgst,
      igst: invoice.igst,
      total_amount: invoice.total_amount,
      allow_duplicate: allowDuplicate,
    };
    const body = new FormData();
    body.append('data', JSON.stringify(payload));
    if (photo) body.append('image', photo); // an invoice typed in by hand has no photo

    try {
      const res = await fetch('/api/invoices', { method: 'POST', body });
      const out = await res.json().catch(() => null);
      if (!res.ok || !out?.ok) {
        setError(out?.error ?? 'The invoice could not be saved. Please try again.');
        setStage('review');
      } else if (out.saved === false) {
        setDuplicates(out.duplicates);
        setStage('review');
      } else {
        setSaved(out);
        setStage('saved');
      }
    } catch {
      setError('Could not reach the server. Nothing was saved. Please try again.');
      setStage('review');
    }
  }

  // ---------------------------------------------------------------------------------
  const pickers = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void readPhoto(file);
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void readPhoto(file);
        }}
      />
    </>
  );

  if (stage === 'idle') {
    return (
      <div className="space-y-4">
        {pickers}
        {error && <ErrorBox message={error} />}
        <Card>
          <h2 className="text-lg font-semibold">Scan an invoice</h2>
          <p className="mt-1 text-sm text-slate-600">
            Lay the invoice flat in good light and keep the whole page in the photo. The AI will fill in the details for you to check.
          </p>
          <div className="mt-4 space-y-3">
            <button className={btn('primary', true)} onClick={() => cameraRef.current?.click()}>
              Take a photo
            </button>
            <button className={btn('secondary', true)} onClick={() => galleryRef.current?.click()}>
              Choose from gallery
            </button>
            <button className={btn('ghost', true)} onClick={startManual}>
              Type it myself (no photo)
            </button>
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold">No invoice at hand?</h2>
          <p className="mt-1 text-sm text-slate-600">Try one of two made-up sample invoices.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button className={btn('secondary')} onClick={() => void loadSample('/samples/sample-1-clean.jpg', 'sample-1.jpg')}>
              Clean copy
            </button>
            <button className={btn('secondary')} onClick={() => void loadSample('/samples/sample-2-phone-photo.jpg', 'sample-2.jpg')}>
              Phone photo
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (stage === 'reading') {
    return (
      <Card>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Your invoice photo" className="mx-auto max-h-72 rounded-lg border border-slate-200" />
        )}
        <Loading label="Reading the invoice... this takes 5 to 15 seconds" />
      </Card>
    );
  }

  if (stage === 'saved' && saved && checked) {
    const inv = checked.invoice;
    return (
      <Card className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
        <h2 className="mt-3 text-xl font-bold">Invoice saved</h2>
        <p className="mt-1 text-slate-700">
          {inv.vendor_name} · {inv.invoice_number}
        </p>
        <p className="text-2xl font-bold">{formatINR(inv.total_amount)}</p>
        <p className="mt-1 text-sm text-slate-600">Due on {formatDate(saved.due_date)}</p>
        {saved.vendor_created && <p className="mt-2 text-sm text-sky-800">A new vendor was added.</p>}
        {saved.notice && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{saved.notice}</p>}
        <div className="mt-5 space-y-3">
          <Link href={`/invoices/${saved.invoice_id}`} className={btn('primary', true)}>
            View invoice
          </Link>
          <button className={btn('secondary', true)} onClick={reset}>
            Scan another invoice
          </button>
        </div>
      </Card>
    );
  }

  // ---- review (and saving) ----
  if (!form) return null;
  const saving = stage === 'saving';
  const globalNotes = [...(byField.get('line_items') ?? []), ...(byField.get('unclear_fields') ?? [])].filter((w) => w.severity !== 'error');
  // Everything that blocks Save, listed at the top, so staff never have to hunt for the reason
  const blocking = warnings.filter((w) => w.severity === 'error');

  return (
    <div className="space-y-4">
      {pickers}

      {/* summary */}
      <Card className={errorCount > 0 ? 'border-red-300 bg-red-50' : warnCount > 0 ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}>
        <p className="font-semibold">
          {errorCount === 0 && warnCount === 0 && 'Everything looks right. Compare with the photo, then save.'}
          {errorCount > 0 && `${errorCount} thing${errorCount > 1 ? 's' : ''} to fix before saving`}
          {errorCount > 0 && warnCount > 0 && ' · '}
          {warnCount > 0 && `${warnCount} to double-check`}
        </p>
        <p className="mt-1 text-sm text-slate-700">
          {previewUrl ? 'The AI can misread numbers. Compare each field with the photo.' : 'Type the details from the paper invoice. No photo is saved with it.'}
        </p>
        {blocking.map((w, i) => (
          <p key={`b${i}`} className="mt-2 text-sm font-medium text-red-800">
            • {w.message}
          </p>
        ))}
        {globalNotes.map((w, i) => (
          <p key={i} className="mt-2 text-sm text-slate-800">
            • {w.message}
          </p>
        ))}
        {previewUrl && (
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-teal-800">Show the photo</summary>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Your invoice photo" className="mt-2 max-h-[70vh] w-full rounded-lg border border-slate-200 bg-white object-contain" />
          </details>
        )}
      </Card>

      {error && <ErrorBox message={error} />}

      {/* possible duplicate: nothing was saved yet */}
      {duplicates && (
        <div role="alert" className="rounded-2xl border-2 border-red-400 bg-red-50 p-4">
          <p className="font-bold text-red-800">Possible duplicate. Not saved yet.</p>
          <p className="mt-1 text-sm text-red-900">This vendor already has an invoice that looks the same:</p>
          <ul className="mt-2 space-y-2">
            {duplicates.map((d) => (
              <li key={d.invoice_id} className="rounded-lg bg-white p-2 text-sm">
                <Link href={`/invoices/${d.invoice_id}`} className="font-semibold text-teal-800 underline">
                  {d.invoice_number}
                </Link>{' '}
                · {formatDate(d.invoice_date)} · {formatINR(d.total_amount)} · {d.payment_status}
                <span className="block text-xs text-slate-600">{d.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-red-900">Saving it again may cause a double payment.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button className={btn('secondary')} onClick={() => setDuplicates(null)}>
              Do not save
            </button>
            <button className={btn('danger')} onClick={() => void save(true)}>
              Save anyway
            </button>
          </div>
        </div>
      )}

      {/* vendor */}
      <Card className="space-y-3">
        <h2 className="font-semibold">Vendor</h2>
        <Field label="Vendor name" value={form.vendor_name} onChange={(v) => setValue('vendor_name', v)} warnings={byField.get('vendor_name')} />
        <Field
          label="GSTIN"
          value={form.vendor_gstin}
          onChange={(v) => setValue('vendor_gstin', v.toUpperCase())}
          warnings={byField.get('vendor_gstin')}
          hint="15 characters, for example 19ABCDE1234F1Z5"
        />
      </Card>

      {/* invoice */}
      <Card className="space-y-3">
        <h2 className="font-semibold">Invoice</h2>
        <Field label="Invoice number" value={form.invoice_number} onChange={(v) => setValue('invoice_number', v)} warnings={byField.get('invoice_number')} />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Invoice date"
            value={form.invoice_date}
            onChange={(v) => setValue('invoice_date', v)}
            warnings={byField.get('invoice_date')}
            placeholder="DD-MM-YYYY"
          />
          <Field
            label="Due date"
            value={form.due_date}
            onChange={(v) => setForm((f) => (f ? { ...f, due_date: v, dueNote: '' } : f))}
            warnings={byField.get('due_date')}
            hint={form.dueNote}
            placeholder="DD-MM-YYYY"
          />
        </div>
      </Card>

      {/* items */}
      <Card className="space-y-3">
        <h2 className="font-semibold">Items ({form.lines.length})</h2>
        {form.lines.map((line, i) => {
          const lineWarnings = byField.get(`line_items[${i}]`);
          return (
            <div key={line.id} className={`rounded-xl border p-3 ${ringFor(lineWarnings)}`}>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <MiniField label={`Item ${i + 1}`} value={line.name} onChange={(v) => updateLine(i, { name: v })} flagged={!line.name} />
                </div>
                <button
                  onClick={() => removeLine(i)}
                  aria-label={`Remove item ${i + 1}`}
                  className="min-h-11 min-w-11 rounded-lg text-xl text-slate-500 ring-1 ring-slate-300"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_1fr_1.3fr_1.4fr] gap-2">
                <MiniField label="Qty" value={line.qty} onChange={(v) => updateLine(i, { qty: v })} inputMode="decimal" />
                <MiniField label="Unit" value={line.unit} onChange={(v) => updateLine(i, { unit: v })} flagged={!line.unit} placeholder={DEFAULT_UNIT} />
                <MiniField label="Price ₹" value={line.price} onChange={(v) => updateLine(i, { price: v })} inputMode="decimal" />
                <MiniField label="Amount ₹" value={line.total} onChange={(v) => updateLine(i, { total: v })} inputMode="decimal" />
              </div>
              <Messages warnings={lineWarnings} />
            </div>
          );
        })}
        <button className={btn('secondary', true)} onClick={addLine}>
          + Add an item
        </button>
      </Card>

      {/* totals */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Tax and total</h2>
          <button className={btn('ghost')} onClick={recalculateTotals}>
            Recalculate
          </button>
        </div>
        <Field label="Sub total ₹ (before tax)" value={form.subtotal} onChange={(v) => setValue('subtotal', v)} warnings={byField.get('subtotal')} inputMode="decimal" />
        <div className="grid grid-cols-3 gap-3">
          <Field label="CGST ₹" value={form.cgst} onChange={(v) => setValue('cgst', v)} inputMode="decimal" />
          <Field label="SGST ₹" value={form.sgst} onChange={(v) => setValue('sgst', v)} warnings={byField.get('sgst')} inputMode="decimal" />
          <Field label="IGST ₹" value={form.igst} onChange={(v) => setValue('igst', v)} warnings={byField.get('igst')} inputMode="decimal" />
        </div>
        <Field label="Total amount ₹" value={form.total} onChange={(v) => setValue('total', v)} warnings={byField.get('total_amount')} inputMode="decimal" />
      </Card>

      <div className="space-y-3">
        <button className={btn('primary', true)} disabled={errorCount > 0 || saving} onClick={() => void save(false)}>
          {saving ? 'Saving...' : 'Save invoice'}
        </button>
        {errorCount > 0 && <p className="text-center text-sm text-red-700">Fix the red fields to save.</p>}
        <button className={btn('secondary', true)} disabled={saving} onClick={reset}>
          Cancel and start again
        </button>
      </div>
    </div>
  );
}
