-- =====================================================================
-- Smart Invoice Tracker  |  Phase 3: the SQL views (all analysis logic lives here)
-- Run AFTER 01 and 02. Safe to re-run: it drops and re-creates every view.
--
-- What is a VIEW?  A saved SELECT query with a name. You query it like a table
-- (SELECT * FROM v_payments_due), but it always recalculates from the live data.
-- Nothing is stored twice, so a flag can never be "out of date".
--
-- Views are built in layers (a later view reads an earlier one):
--
--   today_ist()  (helper function)
--   v_flag_duplicates ─┬─> v_purchase_lines ─> v_price_history ─> v_flag_price_jumps
--                      │                   └─> v_price_comparison
--   v_flag_bad_gstin   │
--        └──────┬──────┴─────────────────────────────┐
--               └─> v_all_flags ─> v_invoice_list    │
--   v_payments_due  <──(uses v_flag_duplicates)───────┘
--        └─> v_payments_summary
--
-- SECURITY: every view uses  WITH (security_invoker = true).  It means "run this
-- view with the permissions of whoever asks". The tables have Row Level Security
-- ON with no open policies, so the public (anon) key sees nothing, even through
-- a view. Only our backend (secret service key) can read the results.
--
-- MySQL -> PostgreSQL cheat sheet for the syntax used below:
--   date - date                  gives a number of days   (MySQL: DATEDIFF(a, b))
--   a || b                       joins text               (MySQL: CONCAT(a, b))
--   x !~ 'regex'                 "does NOT match regex"   (MySQL: x NOT REGEXP 'regex')
--   SUM(x) FILTER (WHERE ...)    conditional aggregate    (MySQL: SUM(CASE WHEN ... END))
--   LAG(), ROW_NUMBER(), OVER    same as MySQL 8 window functions
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) CLEAN-UP: drop old versions (children first, parents last)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_payments_summary   CASCADE;
DROP VIEW IF EXISTS v_payments_due       CASCADE;
DROP VIEW IF EXISTS v_invoice_list       CASCADE;
DROP VIEW IF EXISTS v_all_flags          CASCADE;
DROP VIEW IF EXISTS v_flag_bad_gstin     CASCADE;
DROP VIEW IF EXISTS v_flag_price_jumps   CASCADE;
DROP VIEW IF EXISTS v_price_comparison   CASCADE;
DROP VIEW IF EXISTS v_price_history      CASCADE;
DROP VIEW IF EXISTS v_purchase_lines     CASCADE;
DROP VIEW IF EXISTS v_flag_duplicates    CASCADE;


-- ---------------------------------------------------------------------
-- 1) HELPER: today's date in India.
-- The database server runs in UTC, so CURRENT_DATE is "yesterday" in India
-- between 00:00 and 05:30 IST. This tiny function fixes that in one place.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION today_ist() RETURNS date
LANGUAGE sql STABLE
SET search_path = ''
AS $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;


-- =====================================================================
-- PART A: FLAGS
-- =====================================================================

-- ---------------------------------------------------------------------
-- FLAG 1: v_flag_duplicates  -- possible duplicate invoices
--
-- Two invoices from the SAME vendor are suspected duplicates when EITHER
--   rule 1: they have the same invoice number, OR
--   rule 2: they have the same total amount AND the same invoice date.
--
-- One row = one suspected COPY. We always flag the invoice that was entered
-- LATER ("later") and point to the one entered first ("earlier"), so the
-- earlier one is treated as the real invoice and the later one is the one
-- not to pay.
-- ---------------------------------------------------------------------
CREATE VIEW v_flag_duplicates
WITH (security_invoker = true) AS
SELECT
    later.id                 AS invoice_id,          -- the suspected copy
    later.invoice_number,
    v.name                   AS vendor_name,
    later.invoice_date,
    later.total_amount,
    later.payment_status,
    earlier.id               AS duplicate_of_id,     -- the invoice it copies
    earlier.invoice_number   AS duplicate_of_number,
    earlier.invoice_date     AS duplicate_of_date,
    CASE
        -- tell the user WHICH rule fired
        WHEN lower(trim(earlier.invoice_number)) = lower(trim(later.invoice_number))
         AND earlier.total_amount = later.total_amount
         AND earlier.invoice_date = later.invoice_date
            THEN 'same vendor + invoice number + amount + date'
        WHEN lower(trim(earlier.invoice_number)) = lower(trim(later.invoice_number))
            THEN 'same vendor + invoice number'
        ELSE     'same vendor + amount + date'
    END                      AS match_reason
FROM invoices later
JOIN invoices earlier                                 -- self-join: compare the table with itself
  ON  earlier.vendor_id = later.vendor_id             -- same vendor only
  AND earlier.id <> later.id                          -- never match an invoice with itself
  -- "earlier" must have been ENTERED before "later". Comparing two columns at
  -- once, (created_at, id) < (created_at, id), also breaks ties safely.
  AND (earlier.created_at, earlier.id) < (later.created_at, later.id)
  AND (
        lower(trim(earlier.invoice_number)) = lower(trim(later.invoice_number))        -- rule 1
        OR (earlier.total_amount = later.total_amount
            AND earlier.invoice_date = later.invoice_date)                              -- rule 2
      )
JOIN vendors v ON v.id = later.vendor_id;


-- ---------------------------------------------------------------------
-- FLAG 3: v_flag_bad_gstin  -- GSTIN that is not in the standard format
--
-- A valid GSTIN has exactly 15 characters:
--   2 digits (state code) + 5 capital letters + 4 digits + 1 letter (PAN)
--   + 1 entity code (1-9 or letter) + the letter Z + 1 check character
-- Example: 19BGTRD4521K1Z7
-- This checks the FORMAT only. It does not check that the GSTIN really exists.
-- A vendor with no GSTIN (NULL) is NOT flagged: small unregistered sellers exist.
-- One row per invoice of such a vendor, so the Invoices list can show a badge.
-- ---------------------------------------------------------------------
CREATE VIEW v_flag_bad_gstin
WITH (security_invoker = true) AS
SELECT
    i.id             AS invoice_id,
    i.invoice_number,
    v.id             AS vendor_id,
    v.name           AS vendor_name,
    v.gstin,
    CASE
        WHEN length(v.gstin) <> 15
            THEN 'has ' || length(v.gstin) || ' characters, expected 15'
        ELSE 'characters are not in the standard GSTIN pattern'
    END              AS problem
FROM invoices i
JOIN vendors  v ON v.id = i.vendor_id
WHERE v.gstin IS NOT NULL
  AND v.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$';   -- !~  means "does not match this regex"


-- =====================================================================
-- PART B: PRICES
-- =====================================================================

-- ---------------------------------------------------------------------
-- v_purchase_lines  -- the clean base for all price analysis
--
-- One row per item line, with vendor and invoice details attached.
-- Suspected duplicate copies are LEFT OUT here, otherwise a scanned-twice
-- invoice would count the same purchase twice in averages and histories.
-- ---------------------------------------------------------------------
CREATE VIEW v_purchase_lines
WITH (security_invoker = true) AS
SELECT
    i.id            AS invoice_id,
    i.invoice_number,
    i.invoice_date,
    i.created_at,
    v.id            AS vendor_id,
    v.name          AS vendor_name,
    ii.id           AS item_line_id,
    ii.item_name,                       -- as printed on the invoice
    ii.item_key,                        -- lower-case, trimmed: used for matching
    ii.unit,
    ii.quantity,
    ii.unit_price
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
JOIN vendors  v ON v.id = i.vendor_id
WHERE NOT EXISTS (                      -- keep only lines of invoices that are NOT suspected copies
        SELECT 1 FROM v_flag_duplicates d WHERE d.invoice_id = i.id
      );


-- ---------------------------------------------------------------------
-- v_price_history  -- how the price of each item changed over time, per vendor
--
-- LAG() looks at the previous row inside the same group. The group
-- (PARTITION BY) is: same vendor + same item + same unit. Inside the group the
-- rows are sorted by date, so "previous row" = "the last time we bought this
-- item from this vendor". The first purchase has no previous price (NULL).
-- Unit is part of the group because Rs 50 per kg and Rs 50 per packet are
-- different things.
-- ---------------------------------------------------------------------
CREATE VIEW v_price_history
WITH (security_invoker = true) AS
SELECT
    p.invoice_id,
    p.invoice_number,
    p.invoice_date,
    p.vendor_id,
    p.vendor_name,
    p.item_name,
    p.item_key,
    p.unit,
    p.quantity,
    p.unit_price,
    LAG(p.unit_price) OVER w   AS previous_price,
    -- % change = (new - old) / old * 100.  NULLIF avoids dividing by zero.
    ROUND( (p.unit_price - LAG(p.unit_price) OVER w)
           / NULLIF(LAG(p.unit_price) OVER w, 0) * 100, 1 )   AS price_change_pct
FROM v_purchase_lines p
WINDOW w AS (PARTITION BY p.vendor_id, p.item_key, p.unit
             ORDER BY p.invoice_date, p.created_at, p.item_line_id);


-- ---------------------------------------------------------------------
-- FLAG 2: v_flag_price_jumps  -- unusual price increases
--
-- A line is flagged when its price is MORE THAN 10% above the previous price
-- of the same item from the same vendor.  (To change the limit, change 1.10:
-- 1.10 = +10%, 1.05 = +5%.)  Price drops are never flagged.
-- ---------------------------------------------------------------------
CREATE VIEW v_flag_price_jumps
WITH (security_invoker = true) AS
SELECT
    invoice_id,
    invoice_number,
    vendor_name,
    invoice_date,
    item_name,
    item_key,
    unit,
    previous_price,
    unit_price,
    price_change_pct
FROM v_price_history
WHERE previous_price IS NOT NULL
  AND unit_price > previous_price * 1.10;


-- ---------------------------------------------------------------------
-- v_price_comparison  -- the same item compared across vendors
--
-- One row per (item, unit, vendor).  For each row we show how that vendor's
-- LATEST price compares with the cheapest vendor's latest price.
-- Rows where vendors_selling_it = 1 have nothing to compare with; the app
-- can hide them.
-- ---------------------------------------------------------------------
CREATE VIEW v_price_comparison
WITH (security_invoker = true) AS
WITH ranked AS (
    -- number each vendor's purchases of an item, newest first (rank 1 = latest)
    SELECT
        p.*,
        ROW_NUMBER() OVER (PARTITION BY p.vendor_id, p.item_key, p.unit
                           ORDER BY p.invoice_date DESC, p.created_at DESC, p.item_line_id) AS recency_rank
    FROM v_purchase_lines p
),
per_vendor AS (
    -- squash the purchases into ONE row per vendor + item + unit
    SELECT
        item_key,
        unit,
        vendor_id,
        vendor_name,
        MAX(item_name) FILTER (WHERE recency_rank = 1)   AS item_name,     -- latest printed name
        COUNT(*)                                         AS times_bought,
        ROUND(AVG(unit_price), 2)                        AS avg_price,
        MIN(unit_price)                                  AS lowest_price,
        MAX(unit_price)                                  AS highest_price,
        MAX(unit_price) FILTER (WHERE recency_rank = 1)  AS latest_price,  -- price on the newest invoice
        MAX(invoice_date)                                AS last_bought_on
    FROM ranked
    GROUP BY item_key, unit, vendor_id, vendor_name
)
SELECT
    item_key,
    item_name,
    unit,
    vendor_id,
    vendor_name,
    times_bought,
    avg_price,
    lowest_price,
    highest_price,
    latest_price,
    last_bought_on,
    COUNT(*)          OVER w   AS vendors_selling_it,        -- how many vendors sell this item
    MIN(latest_price) OVER w   AS cheapest_latest_price,     -- best latest price among them
    ROUND( (latest_price - MIN(latest_price) OVER w)
           / MIN(latest_price) OVER w * 100, 1 )             AS pct_above_cheapest,
    (latest_price = MIN(latest_price) OVER w)                AS is_cheapest
FROM per_vendor
WINDOW w AS (PARTITION BY item_key, unit);                   -- "all vendors of the same item"


-- =====================================================================
-- PART C: ALL FLAGS TOGETHER + INVOICE LIST
-- =====================================================================

-- ---------------------------------------------------------------------
-- v_all_flags  -- the three flags in ONE list: one row per (invoice, flag)
-- UNION ALL simply stacks the results of the three queries on top of each other.
-- ---------------------------------------------------------------------
CREATE VIEW v_all_flags
WITH (security_invoker = true) AS
SELECT invoice_id,
       'DUPLICATE'  AS flag_type,
       'Looks like a copy of ' || duplicate_of_number || ' (' || match_reason || ')'   AS flag_detail
FROM v_flag_duplicates
UNION ALL
SELECT invoice_id,
       'PRICE_JUMP' AS flag_type,
       item_name || ' is up ' || price_change_pct || '% (Rs ' || previous_price || ' -> Rs ' || unit_price || ')'
FROM v_flag_price_jumps
UNION ALL
SELECT invoice_id,
       'BAD_GSTIN'  AS flag_type,
       'GSTIN ' || gstin || ' ' || problem
FROM v_flag_bad_gstin;


-- ---------------------------------------------------------------------
-- v_invoice_list  -- feeds the Invoices screen
-- One row per invoice, with vendor details, a status label and the flags.
-- ---------------------------------------------------------------------
CREATE VIEW v_invoice_list
WITH (security_invoker = true) AS
SELECT
    i.id              AS invoice_id,
    v.name            AS vendor_name,
    v.gstin           AS vendor_gstin,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.subtotal,
    i.cgst,
    i.sgst,
    i.igst,
    i.total_amount,
    i.payment_status,
    i.paid_on,
    i.image_path,
    i.created_at,
    CASE
        WHEN i.payment_status = 'paid'   THEN 'Paid'
        WHEN i.due_date < today_ist()    THEN 'Overdue'
        ELSE 'Unpaid'
    END               AS status_label,
    COALESCE(f.flag_count, 0)  AS flag_count,      -- 0 when the invoice has no flags
    f.flag_types                                   -- e.g. 'BAD_GSTIN, DUPLICATE'
FROM invoices i
JOIN vendors v ON v.id = i.vendor_id
LEFT JOIN (                                        -- LEFT JOIN keeps invoices that have no flags
    SELECT invoice_id,
           COUNT(*)                                          AS flag_count,
           STRING_AGG(DISTINCT flag_type, ', ' ORDER BY flag_type) AS flag_types
    FROM v_all_flags
    GROUP BY invoice_id
) f ON f.invoice_id = i.id;


-- =====================================================================
-- PART D: PAYMENTS
-- =====================================================================

-- ---------------------------------------------------------------------
-- v_payments_due  -- every UNPAID invoice with its due-date bucket
--
-- days_until_due:  negative = overdue by that many days, 0 = due today.
-- Suspected duplicate copies stay in this list (hiding money silently would be
-- risky) but are marked is_possible_duplicate = true so staff do not pay twice.
-- ---------------------------------------------------------------------
CREATE VIEW v_payments_due
WITH (security_invoker = true) AS
WITH unpaid AS (
    SELECT
        i.id              AS invoice_id,
        v.name            AS vendor_name,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.total_amount,
        (i.due_date - today_ist())   AS days_until_due     -- date - date = number of days
    FROM invoices i
    JOIN vendors v ON v.id = i.vendor_id
    WHERE i.payment_status = 'unpaid'
)
SELECT
    u.*,
    CASE
        WHEN days_until_due < 0   THEN 'Overdue'
        WHEN days_until_due <= 7  THEN 'Due in 0-7 days'
        WHEN days_until_due <= 15 THEN 'Due in 8-15 days'
        WHEN days_until_due <= 30 THEN 'Due in 16-30 days'
        ELSE                           'Due later than 30 days'
    END   AS due_bucket,
    CASE                                                    -- number to sort the buckets in the right order
        WHEN days_until_due < 0   THEN 1
        WHEN days_until_due <= 7  THEN 2
        WHEN days_until_due <= 15 THEN 3
        WHEN days_until_due <= 30 THEN 4
        ELSE                           5
    END   AS bucket_order,
    EXISTS (SELECT 1 FROM v_flag_duplicates d WHERE d.invoice_id = u.invoice_id)   AS is_possible_duplicate
FROM unpaid u;


-- ---------------------------------------------------------------------
-- v_payments_summary  -- the 4 big numbers on top of the Payments screen (ONE row)
--
-- "Next 7 / 15 / 30 days" are CUMULATIVE and include today:
--   next 7 days  = due today up to 7 days from now
--   next 30 days = everything due today up to 30 days from now (includes the 7 and 15)
-- Overdue is separate (due date already passed).
-- possible_duplicate_amount shows how much of the unpaid money belongs to
-- suspected duplicate copies, i.e. money that may be paid by mistake.
-- ---------------------------------------------------------------------
CREATE VIEW v_payments_summary
WITH (security_invoker = true) AS
SELECT
    COUNT(*)                                                                   AS unpaid_invoices,
    COALESCE(SUM(total_amount), 0)                                             AS unpaid_total,

    COUNT(*)          FILTER (WHERE days_until_due < 0)                        AS overdue_invoices,
    COALESCE(SUM(total_amount) FILTER (WHERE days_until_due < 0), 0)           AS overdue_amount,

    COUNT(*)          FILTER (WHERE days_until_due BETWEEN 0 AND 7)            AS due_7_days_invoices,
    COALESCE(SUM(total_amount) FILTER (WHERE days_until_due BETWEEN 0 AND 7), 0)   AS due_7_days_amount,

    COUNT(*)          FILTER (WHERE days_until_due BETWEEN 0 AND 15)           AS due_15_days_invoices,
    COALESCE(SUM(total_amount) FILTER (WHERE days_until_due BETWEEN 0 AND 15), 0)  AS due_15_days_amount,

    COUNT(*)          FILTER (WHERE days_until_due BETWEEN 0 AND 30)           AS due_30_days_invoices,
    COALESCE(SUM(total_amount) FILTER (WHERE days_until_due BETWEEN 0 AND 30), 0)  AS due_30_days_amount,

    COALESCE(SUM(total_amount) FILTER (WHERE is_possible_duplicate), 0)        AS possible_duplicate_amount
FROM v_payments_due;
