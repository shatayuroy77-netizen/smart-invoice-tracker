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

The last three need the server running (`npm run dev` or `npm run start`).

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
