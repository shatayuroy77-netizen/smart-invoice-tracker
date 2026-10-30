// Tests how lib/gemini.ts reacts when Gemini answers with a limit or a busy signal. It uses a FAKE fetch,
// so it never calls Google and uses none of the daily free quota.
//   node --experimental-transform-types scripts/test-gemini-errors.ts
import assert from 'node:assert/strict';
import { extractInvoiceFromImage, GeminiError } from '../lib/gemini.ts';

process.env.GEMINI_API_KEY = 'test-key-not-real';
const image = { base64: 'AAAA', mimeType: 'image/jpeg' };

const DAILY_BODY = JSON.stringify({
  error: {
    code: 429,
    message: 'You exceeded your current quota',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '47104s' },
    ],
  },
});
const MINUTE_BODY = JSON.stringify({ error: { code: 429, message: 'Too many requests', details: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] } });
const GOOD = {
  vendor_name: 'TEST VENDOR', vendor_gstin: null, invoice_number: 'T-1', invoice_date: '2026-10-30', due_date: null, payment_terms_days: null,
  line_items: [{ item_name: 'Thing', quantity: 1, unit: null, unit_price: 10, line_total: 10 }],
  subtotal: 10, cgst: 0, sgst: 0, igst: 0, total_amount: 10, unclear_fields: [],
};
const okResponse = () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(GOOD) }] } }] }), { status: 200 });

let calls: string[] = [];
function fakeFetch(answers: Record<string, () => Response>) {
  globalThis.fetch = (async (url: string | URL | Request) => {
    const model = decodeURIComponent(String(url).split('/models/')[1].split(':')[0]);
    calls.push(model);
    return answers[model]();
  }) as typeof fetch;
}
async function failureOf(): Promise<GeminiError> {
  try {
    await extractInvoiceFromImage(image);
  } catch (e) {
    assert.ok(e instanceof GeminiError, 'a GeminiError is expected');
    return e;
  }
  assert.fail('an error was expected');
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  calls = [];
  await fn();
  passed++;
  console.log('ok  -', name);
}
// Silence the server-log lines the code writes on purpose
console.error = () => {};

await test('daily limit on the main model and a busy backup: the real reason is told, not "did not answer in time"', async () => {
  process.env.GEMINI_MODEL = 'model-a-daily';
  process.env.GEMINI_FALLBACK_MODEL = 'model-a-backup';
  fakeFetch({ 'model-a-daily': () => new Response(DAILY_BODY, { status: 429 }), 'model-a-backup': () => new Response('busy', { status: 503 }) });
  const err = await failureOf();
  assert.equal(err.status, 429);
  assert.match(err.message, /limit for today is used up/);
  assert.match(err.message, /type the invoice in yourself/);
});

await test('the used-up model is not asked again, so the next scan fails fast', async () => {
  const before = calls.length;
  fakeFetch({ 'model-a-daily': () => assert.fail('must not be called again'), 'model-a-backup': () => new Response('busy', { status: 503 }) });
  const err = await failureOf();
  assert.equal(err.status, 429);
  assert.ok(!calls.includes('model-a-daily'), `calls after the first scan: ${calls.slice(before).join(',')}`);
});

await test('daily limit on the main model but the backup works: the scan succeeds', async () => {
  process.env.GEMINI_MODEL = 'model-b-daily';
  process.env.GEMINI_FALLBACK_MODEL = 'model-b-backup';
  fakeFetch({ 'model-b-daily': () => new Response(DAILY_BODY, { status: 429 }), 'model-b-backup': okResponse });
  const invoice = await extractInvoiceFromImage(image);
  assert.equal(invoice.vendor_name, 'TEST VENDOR');
  assert.deepEqual(calls, ['model-b-daily', 'model-b-backup']);
});

await test('a per-minute limit (not daily) says "wait a minute" and is not remembered', async () => {
  process.env.GEMINI_MODEL = 'model-c-minute';
  process.env.GEMINI_FALLBACK_MODEL = 'model-c-backup';
  fakeFetch({ 'model-c-minute': () => new Response(MINUTE_BODY, { status: 429 }), 'model-c-backup': () => new Response(MINUTE_BODY, { status: 429 }) });
  const err = await failureOf();
  assert.equal(err.status, 429);
  assert.match(err.message, /wait a minute/);
  fakeFetch({ 'model-c-minute': okResponse, 'model-c-backup': okResponse });
  assert.equal((await extractInvoiceFromImage(image)).invoice_number, 'T-1'); // asked again, and it worked
});

await test('a busy model (503) on both models still says "very busy"', async () => {
  process.env.GEMINI_MODEL = 'model-d';
  process.env.GEMINI_FALLBACK_MODEL = 'model-d-backup';
  fakeFetch({ 'model-d': () => new Response('busy', { status: 503 }), 'model-d-backup': () => new Response('busy', { status: 503 }) });
  const err = await failureOf();
  assert.equal(err.status, 503);
  assert.match(err.message, /very busy/);
});

console.log(`\nAll ${passed} Gemini error tests passed (no call to Google was made).`);
