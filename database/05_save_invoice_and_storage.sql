-- =====================================================================
-- Smart Invoice Tracker  |  Phase 5: saving an invoice + the photo storage
-- Run AFTER 01-04. Safe to re-run.
--
-- 1) A private storage "bucket" for the invoice photos.
-- 2) save_invoice(): ONE function that saves a whole invoice (vendor + invoice + item lines)
--    in ONE transaction. Either everything is saved or nothing is, so we can never end
--    up with an invoice that has no items.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Storage bucket for invoice photos.
-- public = false  -> nobody can open a photo by guessing its address.
-- The app shows a photo only through a temporary signed link made by the backend.
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoice-photos', 'invoice-photos', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2) save_invoice(p jsonb)
--
-- Input  p : the invoice as JSON, e.g.
--   { "vendor_name": "...", "vendor_gstin": "...", "invoice_number": "...",
--     "invoice_date": "2026-10-27", "due_date": null, "payment_terms_days": 30,
--     "subtotal": 100, "cgst": 2.5, "sgst": 2.5, "igst": 0, "total_amount": 105,
--     "image_path": "2026/10/abc.jpg", "allow_duplicate": false,
--     "line_items": [ { "item_name": "...", "quantity": 1, "unit": "kg",
--                       "unit_price": 100, "line_total": 100 } ] }
--
-- Output   : JSON.
--   { "saved": true,  "invoice_id": "...", "vendor_created": false, ... }   saved
--   { "saved": false, "duplicates": [ ... ] }                              NOT saved: looks like a duplicate
--
-- Steps:
--   a) find the vendor: by GSTIN first, then by name (ignoring capital letters)
--   b) if the vendor exists, look for a duplicate (same duplicate rules as v_flag_duplicates).
--      If one is found and allow_duplicate is not true, STOP and report it
--   c) create the vendor if it is new
--   d) work out the due date if the invoice has none: invoice date + credit days
--   e) insert the invoice and its item lines
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_invoice(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_name          text    := btrim(p->>'vendor_name');
    v_gstin         text    := nullif(btrim(p->>'vendor_gstin'), '');
    v_number        text    := btrim(p->>'invoice_number');
    v_inv_date      date    := (p->>'invoice_date')::date;
    v_total         numeric := (p->>'total_amount')::numeric;
    v_terms         integer := (p->>'payment_terms_days')::integer;
    v_vendor_id     uuid;
    v_vendor_gstin  text;
    v_credit_days   integer;
    v_created       boolean := false;
    v_notice        text;
    v_dups          jsonb;
    v_due           date;
    v_invoice_id    uuid;
BEGIN
    IF v_name IS NULL OR v_name = ''     THEN RAISE EXCEPTION 'vendor_name is required'; END IF;
    IF v_number IS NULL OR v_number = '' THEN RAISE EXCEPTION 'invoice_number is required'; END IF;
    IF v_inv_date IS NULL                THEN RAISE EXCEPTION 'invoice_date is required'; END IF;
    IF v_total IS NULL                   THEN RAISE EXCEPTION 'total_amount is required'; END IF;
    IF jsonb_array_length(coalesce(p->'line_items', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'at least one line item is required';
    END IF;

    -- a) find the vendor
    IF v_gstin IS NOT NULL THEN
        SELECT id, gstin, credit_days INTO v_vendor_id, v_vendor_gstin, v_credit_days
        FROM vendors WHERE gstin = v_gstin;
    END IF;

    IF v_vendor_id IS NULL THEN
        SELECT id, gstin, credit_days INTO v_vendor_id, v_vendor_gstin, v_credit_days
        FROM vendors
        WHERE lower(btrim(name)) = lower(v_name)
        ORDER BY created_at
        LIMIT 1;

        IF v_vendor_id IS NOT NULL AND v_gstin IS NOT NULL
           AND v_vendor_gstin IS NOT NULL AND v_vendor_gstin <> v_gstin THEN
            v_notice := format('Vendor "%s" is already saved with GSTIN %s. The GSTIN on this invoice (%s) was not stored.',
                               v_name, v_vendor_gstin, v_gstin);
        END IF;
    END IF;

    -- b) duplicate check (only possible when the vendor already exists)
    IF v_vendor_id IS NOT NULL AND coalesce((p->>'allow_duplicate')::boolean, false) = false THEN
        SELECT jsonb_agg(jsonb_build_object(
                   'invoice_id',     i.id,
                   'invoice_number', i.invoice_number,
                   'invoice_date',   i.invoice_date,
                   'total_amount',   i.total_amount,
                   'payment_status', i.payment_status,
                   'reason', CASE
                       WHEN lower(btrim(i.invoice_number)) = lower(v_number) THEN 'same vendor + invoice number'
                       ELSE 'same vendor + amount + date'
                   END) ORDER BY i.invoice_date DESC)
          INTO v_dups
          FROM invoices i
         WHERE i.vendor_id = v_vendor_id
           AND (   lower(btrim(i.invoice_number)) = lower(v_number)
                OR (i.total_amount = v_total AND i.invoice_date = v_inv_date));

        IF v_dups IS NOT NULL THEN
            RETURN jsonb_build_object('saved', false, 'duplicates', v_dups);
        END IF;
    END IF;

    -- c) create the vendor if it is new (credit days from the invoice terms, else 30)
    IF v_vendor_id IS NULL THEN
        INSERT INTO vendors (name, gstin, credit_days)
        VALUES (v_name, v_gstin, coalesce(v_terms, 30))
        RETURNING id, credit_days INTO v_vendor_id, v_credit_days;
        v_created := true;
    ELSIF v_vendor_gstin IS NULL AND v_gstin IS NOT NULL THEN
        UPDATE vendors SET gstin = v_gstin WHERE id = v_vendor_id;   -- learn the GSTIN of a known vendor
    END IF;

    -- d) due date: printed one, else invoice date + payment terms, else invoice date + vendor credit days
    v_due := coalesce(nullif(p->>'due_date', '')::date,
                      v_inv_date + coalesce(v_terms, v_credit_days));

    -- e) the invoice
    INSERT INTO invoices (vendor_id, invoice_number, invoice_date, due_date, subtotal, cgst, sgst, igst,
                          total_amount, payment_status, image_path)
    VALUES (v_vendor_id, v_number, v_inv_date, v_due,
            (p->>'subtotal')::numeric,
            coalesce((p->>'cgst')::numeric, 0),
            coalesce((p->>'sgst')::numeric, 0),
            coalesce((p->>'igst')::numeric, 0),
            v_total, 'unpaid', nullif(p->>'image_path', ''))
    RETURNING id INTO v_invoice_id;

    -- and its item lines (jsonb_to_recordset turns the JSON array into rows)
    INSERT INTO invoice_items (invoice_id, item_name, quantity, unit, unit_price, line_total)
    SELECT v_invoice_id, btrim(x.item_name), x.quantity, btrim(x.unit), x.unit_price, x.line_total
    FROM jsonb_to_recordset(p->'line_items')
         AS x(item_name text, quantity numeric, unit text, unit_price numeric, line_total numeric);

    RETURN jsonb_build_object('saved', true,
                              'invoice_id', v_invoice_id,
                              'vendor_id', v_vendor_id,
                              'vendor_created', v_created,
                              'due_date', v_due,
                              'notice', v_notice);
END;
$$;

-- Only our backend (the secret service key) may call it. The public key cannot.
REVOKE ALL ON FUNCTION save_invoice(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_invoice(jsonb) TO service_role;
