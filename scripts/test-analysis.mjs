// Checks that the two newer analysis views agree with the older ones, through the real API.
//   v_cashflow_weekly  must add up to the same money as v_payments_summary / v_payments_due
//   v_vendor_scorecard must rank only vendors that have enough data, with no gaps or double places
// Run:  node scripts/test-analysis.mjs        (server must be running)
const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
};
const sum = (rows, pick) => rows.reduce((total, row) => total + Number(pick(row)), 0);
const same = (a, b) => Math.abs(a - b) < 0.005; // money: equal to the paisa

console.log('--- cash flow, week by week ---');
const pay = await (await fetch(`${BASE}/api/payments`)).json();
check('payments API answers', pay.ok === true && Array.isArray(pay.weekly));
const weeks = pay.weekly;
check('always 10 rows (overdue, 8 weeks, later)', weeks.length === 10, `${weeks.length} rows`);
check('weeks are numbered -1 to 8 in order', weeks.every((w, i) => w.week_no === i - 1));

const unpaidTotal = Number(pay.summary.unpaid_total);
check('all weeks add up to the total unpaid amount', same(sum(weeks, (w) => w.amount), unpaidTotal), `${sum(weeks, (w) => w.amount)} vs ${unpaidTotal}`);
check('overdue row equals the overdue tile', same(Number(weeks[0].amount), Number(pay.summary.overdue_amount)));
check('invoice counts add up to the unpaid invoices', sum(weeks, (w) => w.invoices) === pay.invoices.length, `${sum(weeks, (w) => w.invoices)} vs ${pay.invoices.length}`);
check('last running total is the total unpaid amount', same(Number(weeks[9].running_total), unpaidTotal));
check('running total never goes down', weeks.every((w, i) => i === 0 || Number(w.running_total) >= Number(weeks[i - 1].running_total)));
check('duplicate money adds up to the duplicate banner', same(sum(weeks, (w) => w.possible_duplicate_amount), Number(pay.summary.possible_duplicate_amount)));

// the same weeks, worked out again from the plain list of unpaid invoices
const byWeek = new Map();
for (const inv of pay.invoices) {
  const d = Number(inv.days_until_due);
  const no = d < 0 ? -1 : d >= 56 ? 8 : Math.floor(d / 7);
  byWeek.set(no, (byWeek.get(no) ?? 0) + Number(inv.total_amount));
}
check('every week matches a recount from the invoice list', weeks.every((w) => same(Number(w.amount), byWeek.get(w.week_no) ?? 0)));

console.log('\n--- supplier scorecard ---');
const pr = await (await fetch(`${BASE}/api/prices`)).json();
check('prices API answers with vendors', pr.ok === true && Array.isArray(pr.vendors) && pr.vendors.length > 0, `${pr.vendors?.length} vendors`);
const vendors = pr.vendors;
const ranked = vendors.filter((v) => v.price_rise_rank != null);
check('only vendors with enough trend data are ranked', vendors.every((v) => (v.price_rise_rank != null) === v.enough_trend_data));
check('only vendors with enough comparison data get a price-level rank', vendors.every((v) => (v.price_level_rank != null) === v.enough_comparison_data));
check('rank 1 has the highest average price change', ranked.length === 0 || Number(ranked.find((v) => v.price_rise_rank === 1).avg_price_change_pct) === Math.max(...ranked.map((v) => Number(v.avg_price_change_pct))));
check('ranks never go up as the average goes down', ranked.every((v, i) => i === 0 || Number(v.avg_price_change_pct) <= Number(ranked[i - 1].avg_price_change_pct)));
check('ranked vendors come first in the list', vendors.findIndex((v) => v.price_rise_rank == null) === -1 || vendors.slice(vendors.findIndex((v) => v.price_rise_rank == null)).every((v) => v.price_rise_rank == null));
check('"enough data" matches the stated limits (5 changes, 3 shared items)', vendors.every((v) => v.enough_trend_data === v.price_comparisons >= 5 && v.enough_comparison_data === v.shared_items >= 3));

// the jump count must agree with the price alerts shown on the same screen
const jumpsByVendor = new Map();
for (const j of pr.jumps) jumpsByVendor.set(j.vendor_name, (jumpsByVendor.get(j.vendor_name) ?? 0) + 1);
check('jump counts match the price alerts', vendors.every((v) => v.price_jumps === (jumpsByVendor.get(v.vendor_name) ?? 0)), vendors.map((v) => `${v.price_jumps}`).join(','));

console.log(failed === 0 ? '\nAll analysis checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
