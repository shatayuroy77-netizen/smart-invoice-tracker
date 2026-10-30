-- =====================================================================
-- Smart Invoice Tracker  |  Optional file 3: quick checks after loading the data
-- In the Supabase SQL Editor, select ONE query at a time and press Run.
-- (The editor shows only the result of the last query if you run them all together.)
-- =====================================================================

-- CHECK 1: row counts.  Expected: vendors = 9, invoices = 40, invoice_items = 158
SELECT 'vendors' AS table_name, COUNT(*) AS rows FROM vendors
UNION ALL
SELECT 'invoices',      COUNT(*) FROM invoices
UNION ALL
SELECT 'invoice_items', COUNT(*) FROM invoice_items;


-- CHECK 2: invoices per vendor and their total value.
-- Expected invoice counts: Bengal Grain 6, Eastern Dairy 6, Shree Ganesh 5, Ma Tara 5,
-- Howrah 4, Mahavir 4, Kolkata Plastic 4, Sonar Bangla 3, Rajdhani 3
SELECT v.name,
       COUNT(i.id)        AS invoices,
       SUM(i.total_amount) AS total_value
FROM vendors v
JOIN invoices i ON i.vendor_id = v.id
GROUP BY v.name
ORDER BY invoices DESC, v.name;


-- CHECK 3: does every invoice's subtotal equal the sum of its item lines?
-- Expected: NO rows (an empty result means the data is consistent).
SELECT i.invoice_number, i.subtotal, SUM(ii.line_total) AS items_sum
FROM invoices i
JOIN invoice_items ii ON ii.invoice_id = i.id
GROUP BY i.id, i.invoice_number, i.subtotal
HAVING i.subtotal <> SUM(ii.line_total);


-- CHECK 4: does total = subtotal + CGST + SGST + IGST on every invoice?  Expected: NO rows.
SELECT invoice_number, total_amount, subtotal + cgst + sgst + igst AS recalculated
FROM invoices
WHERE total_amount <> subtotal + cgst + sgst + igst;


-- CHECK 5: paid vs unpaid.  Expected: paid = 18, unpaid = 22
SELECT payment_status, COUNT(*) AS invoices, SUM(total_amount) AS amount
FROM invoices
GROUP BY payment_status;


-- CHECK 6: the item_key column at work.
-- Bengal Grain prints 'Gobindobhog Rice 25kg', Ma Tara prints 'GOBINDOBHOG RICE 25KG'.
-- Expected: both vendors appear, all with the same item_key.
SELECT v.name AS vendor, ii.item_name AS printed_name, ii.item_key, ii.unit_price
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
JOIN vendors  v ON v.id = i.vendor_id
WHERE ii.item_key = 'gobindobhog rice 25kg'
ORDER BY i.invoice_date;


-- CHECK 7: a look at the invoice list the way the app will show it (DD-MM-YYYY).
SELECT v.name                              AS vendor,
       i.invoice_number,
       to_char(i.invoice_date, 'DD-MM-YYYY') AS invoice_date,
       to_char(i.due_date,     'DD-MM-YYYY') AS due_date,
       i.total_amount,
       i.payment_status
FROM invoices i
JOIN vendors v ON v.id = i.vendor_id
ORDER BY i.invoice_date DESC
LIMIT 10;
