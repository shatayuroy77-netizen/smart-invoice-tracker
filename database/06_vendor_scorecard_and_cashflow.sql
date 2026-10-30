-- =====================================================================
-- Smart Invoice Tracker  |  Two more analysis views
-- Run AFTER 04_views.sql. Safe to re-run: it drops and re-creates its own two views.
--
--   v_vendor_scorecard   one row per vendor: who raises prices, who charges more than the others
--   v_cashflow_weekly    unpaid money per week for the next 8 weeks (plus overdue and "later")
--
-- Both are built on views from 04_views.sql, so duplicate copies are already handled the same way:
--   price analysis leaves suspected duplicate copies out, the payments view keeps them but marks them.
--
-- Same security rule as the other views: security_invoker = true (the tables have Row Level
-- Security on, so the public key sees nothing).
-- =====================================================================

DROP VIEW IF EXISTS v_cashflow_weekly  CASCADE;
DROP VIEW IF EXISTS v_vendor_scorecard CASCADE;


-- ---------------------------------------------------------------------
-- v_vendor_scorecard  -- one row per vendor
--
-- Two different questions, so two different numbers:
--
--   1) PRICE TREND  "does this vendor keep raising its prices?"
--      Every time we buy an item again from the same vendor, v_price_history gives the % change
--      against the previous purchase. avg_price_change_pct is the average of those changes.
--      price_jumps counts the changes above 10% (same rule as v_flag_price_jumps).
--
--   2) PRICE LEVEL  "is this vendor more expensive than the others?"
--      Only for items that at least two vendors sell. For each such item we take how far the
--      vendor's latest price is above the cheapest vendor's latest price (pct_above_cheapest from
--      v_price_comparison) and average it. times_cheapest counts the items where it is the cheapest.
--
-- SAMPLE SIZE: a percentage that rests on one item means almost nothing. So each number comes with
-- the count it rests on, and a flag says whether there is enough data to rank it:
--      enough_trend_data       = at least 5 price changes observed
--      enough_comparison_data  = at least 3 items shared with another vendor
-- (To change the limits, change the 5 and the 3 below.)  The ranks are only given to vendors
-- that have enough data; everyone else gets NULL.
-- ---------------------------------------------------------------------
CREATE VIEW v_vendor_scorecard
WITH (security_invoker = true) AS
WITH trend AS (
    SELECT
        vendor_id,
        COUNT(*)                                                       AS price_comparisons,
        ROUND(AVG(price_change_pct), 1)                                AS avg_price_change_pct,
        MAX(price_change_pct)                                          AS biggest_jump_pct,
        COUNT(*) FILTER (WHERE unit_price > previous_price * 1.10)     AS price_jumps
    FROM v_price_history
    WHERE previous_price IS NOT NULL                                   -- the first purchase has nothing to compare with
    GROUP BY vendor_id
),
shared AS (
    SELECT
        vendor_id,
        COUNT(*)                                                       AS shared_items,
        ROUND(AVG(pct_above_cheapest), 1)                              AS avg_pct_above_cheapest,
        COUNT(*) FILTER (WHERE is_cheapest)                            AS times_cheapest
    FROM v_price_comparison
    WHERE vendors_selling_it > 1                                       -- nothing to compare when only one vendor sells it
    GROUP BY vendor_id
),
spend AS (
    SELECT
        vendor_id,
        COUNT(DISTINCT invoice_id)                                     AS invoices,
        ROUND(SUM(quantity * unit_price), 2)                           AS spend_before_tax
    FROM v_purchase_lines
    GROUP BY vendor_id
),
combined AS (
    SELECT
        v.id                                      AS vendor_id,
        v.name                                    AS vendor_name,
        COALESCE(sp.invoices, 0)                  AS invoices,
        COALESCE(sp.spend_before_tax, 0)          AS spend_before_tax,
        COALESCE(t.price_comparisons, 0)          AS price_comparisons,
        t.avg_price_change_pct,
        t.biggest_jump_pct,
        COALESCE(t.price_jumps, 0)                AS price_jumps,
        COALESCE(sh.shared_items, 0)              AS shared_items,
        sh.avg_pct_above_cheapest,
        COALESCE(sh.times_cheapest, 0)            AS times_cheapest,
        COALESCE(t.price_comparisons, 0) >= 5     AS enough_trend_data,
        COALESCE(sh.shared_items, 0)     >= 3     AS enough_comparison_data
    FROM vendors v
    LEFT JOIN trend  t  ON t.vendor_id  = v.id           -- LEFT JOIN: a vendor with no price history still appears
    LEFT JOIN shared sh ON sh.vendor_id = v.id
    LEFT JOIN spend  sp ON sp.vendor_id = v.id
)
SELECT
    c.*,
    -- RANK() is a window function: 1 = the vendor with the highest average price rise.
    -- PARTITION BY the "enough data" flag keeps vendors with too little data out of the ranking.
    CASE WHEN enough_trend_data
         THEN RANK() OVER (PARTITION BY enough_trend_data ORDER BY avg_price_change_pct DESC)
    END   AS price_rise_rank,
    CASE WHEN enough_comparison_data
         THEN RANK() OVER (PARTITION BY enough_comparison_data ORDER BY avg_pct_above_cheapest DESC)
    END   AS price_level_rank
FROM combined c;


-- ---------------------------------------------------------------------
-- v_cashflow_weekly  -- how much has to be paid, week by week
--
-- Rows (always the same 10, so a chart never has gaps):
--   week_no -1     Overdue (due date already passed)
--   week_no 0..7   the 8 weeks starting today: week 0 = today to today+6, week 1 = the 7 days after that ...
--   week_no 8      Later (more than 56 days away)
--
-- running_total adds the rows up from the top: "how much cash do I need by the end of this week
-- if I pay everything that is due so far, including what is already overdue?"
-- possible_duplicate_amount is the part of the week's money that belongs to suspected duplicate
-- copies, i.e. money that may be paid by mistake (they stay in the amount, like in v_payments_due).
-- ---------------------------------------------------------------------
CREATE VIEW v_cashflow_weekly
WITH (security_invoker = true) AS
WITH bucketed AS (
    SELECT
        CASE WHEN days_until_due < 0   THEN -1
             WHEN days_until_due >= 56 THEN 8
             ELSE days_until_due / 7                    -- whole-number division: 0-6 -> 0, 7-13 -> 1, ...
        END                       AS week_no,
        total_amount,
        is_possible_duplicate
    FROM v_payments_due
),
per_week AS (
    SELECT
        week_no,
        COUNT(*)                                                              AS invoices,
        SUM(total_amount)                                                     AS amount,
        COALESCE(SUM(total_amount) FILTER (WHERE is_possible_duplicate), 0)   AS possible_duplicate_amount
    FROM bucketed
    GROUP BY week_no
)
SELECT
    w.week_no,
    CASE WHEN w.week_no = -1 THEN NULL
         ELSE today_ist() + w.week_no * 7                  END   AS starts_on,
    CASE WHEN w.week_no BETWEEN 0 AND 7
         THEN today_ist() + w.week_no * 7 + 6              END   AS ends_on,
    COALESCE(p.invoices, 0)                                      AS invoices,
    COALESCE(p.amount, 0)                                        AS amount,
    COALESCE(p.possible_duplicate_amount, 0)                     AS possible_duplicate_amount,
    SUM(COALESCE(p.amount, 0)) OVER (ORDER BY w.week_no)         AS running_total   -- running total, top to bottom
FROM generate_series(-1, 8) AS w(week_no)                        -- the 10 fixed rows
LEFT JOIN per_week p ON p.week_no = w.week_no;
