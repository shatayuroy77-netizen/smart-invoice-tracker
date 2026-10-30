# Test report (Phase 6)

All tests ran against the **production build** (`npm run build` + `npm run start`) connected to the live
Supabase project with fake data only. Date of the run: 2026-10-30.

## How to repeat the tests

| What | Command |
|---|---|
| Types | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Invoice checks (arithmetic, dates, GSTIN, taxes) | `node scripts/test-checks.ts` |
| AI reads two sample invoices and is compared with the known answers | `node scripts/test-scan.mjs` |
| Save flow end to end (scan, save, duplicate, photo, mark paid, undo, clean up) | `node --env-file=.env.local scripts/test-save.mjs` |
| Wrong and hostile input on every API route | `node scripts/test-api-errors.mjs` (add `--rate-limit` to test the scan limit) |
| Supplier scorecard and weekly cash flow add up with the older views | `node scripts/test-analysis.mjs` |

The last four need the server running (`npm run dev` or `npm run start`).

## Results

| Area | Result |
|---|---|
| TypeScript, lint, production build | pass, no warnings |
| Invoice checks (15 unit tests) | 15 / 15 pass |
| AI reading of 2 sample invoices (a clean copy and a phone photo) | every field matches the expected answers |
| Save flow | 11 / 11 checks pass (new vendor created, duplicate stopped, photo stored and opened, mark paid / repeat refused / undo, test data removed again) |
| Wrong and hostile input | all checks pass: bad files, oversized and empty photos, bad ids, bad JSON, invalid fields, SQL-injection text in search and in item keys, scan rate limit (HTTP 429) |
| Mobile layout (375 px wide) | no sideways scrolling on Scan, Invoices, Payments, Prices |
| PWA | manifest valid (standalone, 3 icons, all load), apple icon present |

## Added later: supplier scorecard and weekly cash flow (2026-10-30)

Two new views, `v_vendor_scorecard` and `v_cashflow_weekly` ([`06_vendor_scorecard_and_cashflow.sql`](../database/06_vendor_scorecard_and_cashflow.sql)),
checked with `node scripts/test-analysis.mjs` against the real API (18 / 18 checks pass), and all the older tests were run again (all pass).

| Check | Result |
|---|---|
| The 10 cash-flow rows (overdue, 8 weeks, later) add up to the total unpaid amount of the Payments summary | equal to the paisa (₹4,68,695.85) |
| Overdue row, invoice counts and duplicate money agree with the older view and the banner | equal |
| Each week recounted from the plain list of unpaid invoices | all 10 weeks equal |
| Running total never goes down and ends at the total unpaid amount | yes |
| Only vendors with enough data are ranked (5 price changes, or 3 shared items) | yes, and ranked vendors come first |
| Rank 1 has the highest average price change; ranks follow the order | yes |
| Jump counts per vendor equal the price alerts shown on the same screen | yes |
| Public (publishable) key reads `v_vendor_scorecard` | empty (RLS) |
| Public key reads `v_cashflow_weekly` | ten rows of zeros and dates only (the calendar), no amounts, vendors or invoices |

A design decision found while checking the numbers: some vendors share only one item with another vendor,
so a percentage like "+14.9% above the cheapest" rests on a single item. The scorecard therefore shows the
count behind every number, leaves suppliers with too little data out of the rankings, and mentions such a number
only in the details line, marked as "too little data to rank". The screen shows two short lists (who raised prices the
most, who charges more than the others), one line per supplier, with the details one tap away.

## Security checks

| Check | Result |
|---|---|
| Someone with only the public (publishable) key reads vendors, invoices, items, views, storage list | gets empty answers (RLS is on, no policies) |
| Same person inserts, updates or deletes rows | insert refused (RLS error), update and delete touch 0 rows |
| Same person calls `save_invoice()` | `permission denied` (execute granted to `service_role` only) |
| Secret keys in the JavaScript sent to browsers (19 files scanned) | none found |
| `.env.local` ignored by git rules | yes (`.env*`) |
| Supabase security advisor | only "RLS enabled, no policy" (INFO), which is intended: no policy means no public access |
| Supabase performance advisor | one unused index (INFO), kept for when the data grows |

## Problems found and fixed during Phase 6

1. **Search text that looks like an SQL attack returned HTTP 500.** The database provider's web firewall
   blocked it and answered with an HTML page, which the app did not understand. No data was touched.
   Fix: `cleanSearch()` now keeps only letters, digits, spaces and `- _ / . & #`, and `handleError()`
   turns a firewall refusal into a polite HTTP 400.
2. **"Mark as paid" for an invoice that does not exist said "already marked as paid".**
   Fix: it now answers 404 "Invoice not found.", and 409 is kept for a real repeat.

## Known limits (not bugs)

- The scan rate limit lives in the memory of one server process, so on Vercel it is per instance. That is
  enough to stop accidents and cheap abuse; a shared store would be needed for a hard limit.
- There is no login: anyone who knows the web address can use the app. This was a decision for the demo
  (one shop, fake data). Add Supabase Auth before using real data.
- The AI sometimes answers "503 high demand". The backend retries once and then switches to a second model.
