-- =====================================================================
-- Smart Invoice Tracker  |  File 1 of 2: create the 3 tables
-- Database: PostgreSQL (Supabase).  Run this ONCE in the Supabase SQL Editor.
-- Safe to re-run: it drops the old tables first (this deletes all data in them).
-- =====================================================================

DROP TABLE IF EXISTS invoice_items CASCADE;
DROP TABLE IF EXISTS invoices      CASCADE;
DROP TABLE IF EXISTS vendors       CASCADE;


-- ---------------------------------------------------------------------
-- TABLE 1: vendors  (one row per supplier)
-- ---------------------------------------------------------------------
CREATE TABLE vendors (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),  -- auto-made unique ID (MySQL: AUTO_INCREMENT)
    name         text        NOT NULL,
    gstin        text        UNIQUE,                  -- 15-char GST number. Optional. Not checked here on purpose:
                                                      -- bad values must be SAVED so the "bad GSTIN" flag can catch them.
    credit_days  integer     NOT NULL DEFAULT 30      -- days the vendor allows for payment; used when the invoice has no due date
                 CHECK (credit_days >= 0),
    created_at   timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- TABLE 2: invoices  (one row per paper invoice)
-- ---------------------------------------------------------------------
CREATE TABLE invoices (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       uuid          NOT NULL REFERENCES vendors(id),   -- foreign key: every invoice belongs to a vendor
    invoice_number  text          NOT NULL,           -- text, because real numbers look like 'BGT/26-27/0412'
    invoice_date    date          NOT NULL,           -- stored as YYYY-MM-DD; the app SHOWS it as DD-MM-YYYY
    due_date        date          NOT NULL,
    subtotal        numeric(12,2) NOT NULL CHECK (subtotal >= 0),    -- amount before tax
    cgst            numeric(12,2) NOT NULL DEFAULT 0,   -- same-state tax, half of the GST (Kolkata vendors)
    sgst            numeric(12,2) NOT NULL DEFAULT 0,   -- same-state tax, other half
    igst            numeric(12,2) NOT NULL DEFAULT 0,   -- other-state tax (instead of CGST + SGST)
    total_amount    numeric(12,2) NOT NULL CHECK (total_amount >= 0),
    payment_status  text          NOT NULL DEFAULT 'unpaid'
                    CHECK (payment_status IN ('unpaid', 'paid')),
    paid_on         date,                             -- filled when "Mark as paid" is pressed
    image_path      text,                             -- where the invoice photo is stored (Supabase Storage)
    created_at      timestamptz   NOT NULL DEFAULT now(),

    CHECK (due_date >= invoice_date),
    -- 'paid' must have a paid_on date, 'unpaid' must not:
    CHECK ((payment_status = 'paid'   AND paid_on IS NOT NULL)
        OR (payment_status = 'unpaid' AND paid_on IS NULL))
    -- NOTE: there is deliberately NO UNIQUE rule on (vendor_id, invoice_number).
    -- Staff must still be able to save a suspicious invoice; the flag views warn about it.
);


-- ---------------------------------------------------------------------
-- TABLE 3: invoice_items  (one row per line on an invoice)
-- ---------------------------------------------------------------------
CREATE TABLE invoice_items (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id  uuid          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,  -- delete an invoice -> its lines go too
    item_name   text          NOT NULL,               -- exactly as printed, e.g. 'TATA SALT 1KG'
    -- item_key is filled in AUTOMATICALLY by the database: lower case, no spaces at the ends.
    -- 'Tata Salt 1kg' and 'TATA SALT 1KG ' both become 'tata salt 1kg', so they can be compared.
    item_key    text          GENERATED ALWAYS AS (lower(trim(item_name))) STORED,
    quantity    numeric(10,3) NOT NULL CHECK (quantity > 0),
    unit        text          NOT NULL,               -- kg, pcs, bag, box, ltr ...
    unit_price  numeric(12,2) NOT NULL CHECK (unit_price >= 0),   -- price per ONE unit, before tax
    line_total  numeric(12,2) NOT NULL CHECK (line_total >= 0)    -- quantity x unit_price
);


-- ---------------------------------------------------------------------
-- INDEXES: make the common searches fast (like an index at the back of a book)
-- ---------------------------------------------------------------------
CREATE INDEX idx_invoices_vendor      ON invoices (vendor_id);
CREATE INDEX idx_invoices_due_date    ON invoices (due_date);
CREATE INDEX idx_items_invoice        ON invoice_items (invoice_id);
CREATE INDEX idx_items_key_unit       ON invoice_items (item_key, unit);


-- ---------------------------------------------------------------------
-- SECURITY: turn on Row Level Security with NO open policies.
-- Meaning: nobody can read or write these tables through Supabase's public
-- (anon) key. Only our own backend, using the secret service key, can.
-- ---------------------------------------------------------------------
ALTER TABLE vendors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
