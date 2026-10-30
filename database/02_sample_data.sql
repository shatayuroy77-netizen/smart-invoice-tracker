-- =====================================================================
-- Smart Invoice Tracker  |  File 2 of 2: 40 FAKE sample invoices
-- Run AFTER 01_create_tables.sql, in the Supabase SQL Editor.
-- Everything here is made up: vendor names, GSTINs and prices are fictional.
--
-- DATES are written relative to the day you run this file (CURRENT_DATE - 29
-- means '29 days ago'), so the Payments screen always has overdue and
-- upcoming invoices. Re-running 01 then 02 later refreshes the dates.
-- IDs are fixed, readable codes (a000..01 = vendor 1, b000..07 = invoice 7)
-- so that the rows can point to each other without lookups.
--
-- TEST CASES PLANTED IN THIS DATA (so you can check Phase 3 later):
--
-- 1) DUPLICATE INVOICES (3 pairs)
--      Bengal Grain Traders | D1: BGT/26-27/0610  vs  BGT/26-27/0610
--         (same vendor + same invoice number + same date and amount (scanned twice))
--      Eastern Dairy & Beverages | D2: EDB/INV/00889  vs  EDB/INV/00889
--         (same vendor + same invoice number (date misread by 1 day))
--      Kolkata Plastic & Household | D3: KPH/0297  vs  KPH/0279
--         (same vendor + same amount + same date (invoice number digits swapped))
--
-- 2) PRICE JUMPS of more than 10% above the vendor's previous price for the same item (5)
--      Bengal Grain Traders         sugar                        Rs 43.32 -> Rs 48.42 (+11.8%) on invoice BGT/26-27/0572
--      Shree Ganesh Oil & Spices    mustard oil 1l pouch         Rs 167.42 -> Rs 198.83 (+18.8%) on invoice SGO-741
--      Eastern Dairy & Beverages    amul ghee 1l                 Rs 601.88 -> Rs 674.15 (+12.0%) on invoice EDB/INV/00889
--      Mahavir Distributors         maggi 2-minute noodles box   Rs 661.28 -> Rs 740.78 (+12.0%) on invoice MD/588/26
--      Kolkata Plastic & Household  plastic bucket 16l           Rs 117.05 -> Rs 141.97 (+21.3%) on invoice KPH/0311
--      Near misses that must NOT be flagged: Red Label Tea at Eastern Dairy (about +6%),
--      and a price DROP on Surf Excel at Howrah Wholesale Mart.
--      Ma Tara Agencies raises rice and masoor dal about 3% on every invoice: no single
--      jump, but a clear creeping trend (a good chart for the Prices screen).
--
-- 3) BAD GSTIN (2 vendors)
--      Mahavir Distributors  10MHVDS5O12M1ZQ  (letter O where a digit 0 belongs)
--      Ma Tara Agencies      19MTRPS4821K1Z   (only 14 characters)
--
-- 4) CROSS-VENDOR PRICES for the same item: rice, masoor dal, sugar, salt (Bengal Grain vs
--    Ma Tara), mustard oil (Shree Ganesh vs Ma Tara), red label tea (Eastern Dairy vs Howrah),
--    Maggi box (Howrah vs Mahavir), Aloo Bhujia (Howrah vs Rajdhani).
--    Howrah and Ma Tara print item names in CAPITALS; the item_key column makes them match.
--
-- 5) PAYMENTS: a mix of paid, overdue, and due within 7 / 15 / 30 days. Vendors 6 and 7 are
--    out of state (IGST); the rest are Kolkata vendors (CGST + SGST).
-- =====================================================================

-- ---------------- VENDORS (9) ----------------
INSERT INTO vendors (id, name, gstin, credit_days, created_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Bengal Grain Traders', '19BGTRD4521K1Z7', 15, CURRENT_DATE - 130),  -- Kolkata (CGST + SGST)
  ('a0000000-0000-0000-0000-000000000002', 'Shree Ganesh Oil & Spices', '19SGOSP7733M1ZB', 30, CURRENT_DATE - 130),  -- Kolkata (CGST + SGST)
  ('a0000000-0000-0000-0000-000000000003', 'Howrah Wholesale Mart', '19HWMRT2290L1Z4', 21, CURRENT_DATE - 130),  -- Kolkata (CGST + SGST)
  ('a0000000-0000-0000-0000-000000000004', 'Eastern Dairy & Beverages', '19EDBVG6618P1Z2', 30, CURRENT_DATE - 130),  -- Kolkata (CGST + SGST)
  ('a0000000-0000-0000-0000-000000000005', 'Sonar Bangla Stationers', '19SBSTN3345R1ZH', 45, CURRENT_DATE - 130),  -- Kolkata (CGST + SGST)
  ('a0000000-0000-0000-0000-000000000006', 'Mahavir Distributors', '10MHVDS5O12M1ZQ', 30, CURRENT_DATE - 130),  -- other state (IGST)
  ('a0000000-0000-0000-0000-000000000007', 'Rajdhani Snacks Supply', '07RJDSN8812H1ZC', 15, CURRENT_DATE - 130),  -- other state (IGST)
  ('a0000000-0000-0000-0000-000000000008', 'Kolkata Plastic & Household', '19KPHLD9954C1ZS', 30, CURRENT_DATE - 130),  -- Kolkata (CGST + SGST)
  ('a0000000-0000-0000-0000-000000000009', 'Ma Tara Agencies', '19MTRPS4821K1Z', 10, CURRENT_DATE - 130);  -- Kolkata (CGST + SGST)

-- ---------------- INVOICES (40: 37 normal + 3 deliberate duplicates) ----------------
INSERT INTO invoices (id, vendor_id, invoice_number, invoice_date, due_date, subtotal, cgst, sgst, igst,
                      total_amount, payment_status, paid_on, created_at) VALUES
  -- invoice 1: Eastern Dairy & Beverages
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'EDB/INV/00823', CURRENT_DATE - 112, CURRENT_DATE - 82, 15591.00, 874.92, 874.92, 0.00, 17340.84, 'paid', CURRENT_DATE - 85, (CURRENT_DATE - 112) + TIME '10:48'),
  -- invoice 2: Bengal Grain Traders
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'BGT/26-27/0518', CURRENT_DATE - 108, CURRENT_DATE - 93, 22463.00, 513.13, 513.13, 0.00, 23489.26, 'paid', CURRENT_DATE - 90, (CURRENT_DATE - 108) + TIME '12:56'),
  -- invoice 3: Mahavir Distributors
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000006', 'MD/497/26', CURRENT_DATE - 104, CURRENT_DATE - 74, 7598.00, 0.00, 0.00, 911.76, 8509.76, 'paid', CURRENT_DATE - 75, (CURRENT_DATE - 104) + TIME '18:55'),
  -- invoice 4: Ma Tara Agencies
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000009', 'MT-417', CURRENT_DATE - 102, CURRENT_DATE - 92, 23345.00, 537.38, 537.38, 0.00, 24419.76, 'paid', CURRENT_DATE - 89, (CURRENT_DATE - 102) + TIME '16:25'),
  -- invoice 5: Shree Ganesh Oil & Spices
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'SGO-672', CURRENT_DATE - 100, CURRENT_DATE - 70, 19410.00, 485.25, 485.25, 0.00, 20380.50, 'paid', CURRENT_DATE - 70, (CURRENT_DATE - 100) + TIME '17:23'),
  -- invoice 6: Howrah Wholesale Mart
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000003', 'HWM/00178', CURRENT_DATE - 95, CURRENT_DATE - 74, 17779.00, 1512.33, 1512.33, 0.00, 20803.66, 'paid', CURRENT_DATE - 75, (CURRENT_DATE - 95) + TIME '18:57'),
  -- invoice 7: Sonar Bangla Stationers
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000005', 'SBS-26-273', CURRENT_DATE - 90, CURRENT_DATE - 45, 10787.00, 734.85, 734.85, 0.00, 12256.70, 'paid', CURRENT_DATE - 48, (CURRENT_DATE - 90) + TIME '12:39'),
  -- invoice 8: Kolkata Plastic & Household
  ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000008', 'KPH/0257', CURRENT_DATE - 86, CURRENT_DATE - 56, 8748.00, 787.32, 787.32, 0.00, 10322.64, 'paid', CURRENT_DATE - 59, (CURRENT_DATE - 86) + TIME '15:30'),
  -- invoice 9: Eastern Dairy & Beverages
  ('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000004', 'EDB/INV/00854', CURRENT_DATE - 84, CURRENT_DATE - 54, 29690.70, 1873.07, 1873.07, 0.00, 33436.84, 'paid', CURRENT_DATE - 54, (CURRENT_DATE - 84) + TIME '15:10'),
  -- invoice 10: Bengal Grain Traders
  ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'BGT/26-27/0546', CURRENT_DATE - 82, CURRENT_DATE - 67, 10156.54, 221.03, 221.03, 0.00, 10598.60, 'paid', CURRENT_DATE - 65, (CURRENT_DATE - 82) + TIME '18:31'),
  -- invoice 11: Ma Tara Agencies
  ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000009', 'MT-427', CURRENT_DATE - 77, CURRENT_DATE - 67, 25950.05, 583.86, 583.86, 0.00, 27117.77, 'paid', CURRENT_DATE - 68, (CURRENT_DATE - 77) + TIME '16:22'),
  -- invoice 12: Mahavir Distributors
  ('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000006', 'MD/515/26', CURRENT_DATE - 75, CURRENT_DATE - 45, 15756.98, 0.00, 0.00, 2128.62, 17885.60, 'paid', CURRENT_DATE - 44, (CURRENT_DATE - 75) + TIME '17:40'),
  -- invoice 13: Shree Ganesh Oil & Spices
  ('b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000002', 'SGO-687', CURRENT_DATE - 73, CURRENT_DATE - 43, 17033.61, 425.84, 425.84, 0.00, 17885.29, 'paid', CURRENT_DATE - 46, (CURRENT_DATE - 73) + TIME '10:28'),
  -- invoice 14: Rajdhani Snacks Supply
  ('b0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000007', 'RS000555', CURRENT_DATE - 70, CURRENT_DATE - 55, 12824.00, 0.00, 0.00, 1538.88, 14362.88, 'paid', CURRENT_DATE - 55, (CURRENT_DATE - 70) + TIME '14:02'),
  -- invoice 15: Howrah Wholesale Mart
  ('b0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000003', 'HWM/00195', CURRENT_DATE - 66, CURRENT_DATE - 45, 13951.59, 1156.58, 1156.58, 0.00, 16264.75, 'unpaid', NULL, (CURRENT_DATE - 66) + TIME '18:26'),
  -- invoice 16: Eastern Dairy & Beverages
  ('b0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000004', 'EDB/INV/00879', CURRENT_DATE - 56, CURRENT_DATE - 26, 21017.60, 1048.14, 1048.14, 0.00, 23113.88, 'paid', CURRENT_DATE - 30, (CURRENT_DATE - 56) + TIME '11:15'),
  -- invoice 17: Bengal Grain Traders
  ('b0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000001', 'BGT/26-27/0562', CURRENT_DATE - 55, CURRENT_DATE - 40, 20254.69, 433.37, 433.37, 0.00, 21121.43, 'paid', CURRENT_DATE - 37, (CURRENT_DATE - 55) + TIME '18:33'),
  -- invoice 18: Ma Tara Agencies
  ('b0000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000009', 'MT-457', CURRENT_DATE - 51, CURRENT_DATE - 41, 16524.05, 413.10, 413.10, 0.00, 17350.25, 'unpaid', NULL, (CURRENT_DATE - 51) + TIME '14:35'),
  -- invoice 19: Sonar Bangla Stationers
  ('b0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000005', 'SBS-26-289', CURRENT_DATE - 50, CURRENT_DATE - 5, 8806.29, 603.39, 603.39, 0.00, 10013.07, 'unpaid', NULL, (CURRENT_DATE - 50) + TIME '15:26'),
  -- invoice 20: Kolkata Plastic & Household
  ('b0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000008', 'KPH/0297', CURRENT_DATE - 49, CURRENT_DATE - 19, 9108.37, 819.76, 819.76, 0.00, 10747.89, 'paid', CURRENT_DATE - 18, (CURRENT_DATE - 49) + TIME '11:04'),
  -- invoice 21: Shree Ganesh Oil & Spices
  ('b0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000002', 'SGO-701', CURRENT_DATE - 47, CURRENT_DATE - 17, 27630.36, 690.76, 690.76, 0.00, 29011.88, 'unpaid', NULL, (CURRENT_DATE - 47) + TIME '10:20'),
  -- invoice 22: Mahavir Distributors
  ('b0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000006', 'MD/553/26', CURRENT_DATE - 40, CURRENT_DATE - 10, 16593.27, 0.00, 0.00, 2283.64, 18876.91, 'unpaid', NULL, (CURRENT_DATE - 40) + TIME '15:52'),
  -- invoice 23: Howrah Wholesale Mart
  ('b0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000003', 'HWM/00209', CURRENT_DATE - 38, CURRENT_DATE - 17, 16854.16, 1435.37, 1435.37, 0.00, 19724.90, 'unpaid', NULL, (CURRENT_DATE - 38) + TIME '16:18'),
  -- invoice 24: Rajdhani Snacks Supply
  ('b0000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000007', 'RS000576', CURRENT_DATE - 33, CURRENT_DATE - 18, 6982.82, 0.00, 0.00, 837.94, 7820.76, 'paid', CURRENT_DATE - 22, (CURRENT_DATE - 33) + TIME '17:27'),
  -- invoice 25: Bengal Grain Traders
  ('b0000000-0000-0000-0000-000000000025', 'a0000000-0000-0000-0000-000000000001', 'BGT/26-27/0572', CURRENT_DATE - 29, CURRENT_DATE - 14, 22489.05, 517.47, 517.47, 0.00, 23523.99, 'unpaid', NULL, (CURRENT_DATE - 29) + TIME '11:40'),
  -- invoice 26: Eastern Dairy & Beverages
  ('b0000000-0000-0000-0000-000000000026', 'a0000000-0000-0000-0000-000000000004', 'EDB/INV/00889', CURRENT_DATE - 28, CURRENT_DATE + 2, 28680.92, 1373.85, 1373.85, 0.00, 31428.62, 'unpaid', NULL, (CURRENT_DATE - 28) + TIME '17:38'),
  -- invoice 27: Ma Tara Agencies
  ('b0000000-0000-0000-0000-000000000027', 'a0000000-0000-0000-0000-000000000009', 'MT-482', CURRENT_DATE - 25, CURRENT_DATE - 15, 26251.53, 656.29, 656.29, 0.00, 27564.11, 'unpaid', NULL, (CURRENT_DATE - 25) + TIME '17:54'),
  -- invoice 28: Shree Ganesh Oil & Spices
  ('b0000000-0000-0000-0000-000000000028', 'a0000000-0000-0000-0000-000000000002', 'SGO-741', CURRENT_DATE - 21, CURRENT_DATE + 9, 27893.03, 697.33, 697.33, 0.00, 29287.69, 'unpaid', NULL, (CURRENT_DATE - 21) + TIME '12:59'),
  -- invoice 29: Kolkata Plastic & Household
  ('b0000000-0000-0000-0000-000000000029', 'a0000000-0000-0000-0000-000000000008', 'KPH/0311', CURRENT_DATE - 14, CURRENT_DATE + 16, 10188.76, 916.99, 916.99, 0.00, 12022.74, 'unpaid', NULL, (CURRENT_DATE - 14) + TIME '18:21'),
  -- invoice 30: Sonar Bangla Stationers
  ('b0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000005', 'SBS-26-322', CURRENT_DATE - 12, CURRENT_DATE + 33, 12380.14, 818.64, 818.64, 0.00, 14017.42, 'unpaid', NULL, (CURRENT_DATE - 12) + TIME '18:25'),
  -- invoice 31: Howrah Wholesale Mart
  ('b0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000003', 'HWM/00247', CURRENT_DATE - 11, CURRENT_DATE + 10, 15184.52, 1152.00, 1152.00, 0.00, 17488.52, 'unpaid', NULL, (CURRENT_DATE - 11) + TIME '18:50'),
  -- invoice 32: Bengal Grain Traders
  ('b0000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000001', 'BGT/26-27/0610', CURRENT_DATE - 10, CURRENT_DATE + 5, 25506.38, 570.43, 570.43, 0.00, 26647.24, 'unpaid', NULL, (CURRENT_DATE - 10) + TIME '17:51'),
  -- invoice 33: Mahavir Distributors
  ('b0000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000006', 'MD/588/26', CURRENT_DATE - 8, CURRENT_DATE + 22, 9529.55, 0.00, 0.00, 1143.55, 10673.10, 'unpaid', NULL, (CURRENT_DATE - 8) + TIME '14:08'),
  -- invoice 34: Shree Ganesh Oil & Spices
  ('b0000000-0000-0000-0000-000000000034', 'a0000000-0000-0000-0000-000000000002', 'SGO-758', CURRENT_DATE - 5, CURRENT_DATE + 25, 27466.98, 686.68, 686.68, 0.00, 28840.34, 'unpaid', NULL, (CURRENT_DATE - 5) + TIME '11:24'),
  -- invoice 35: Ma Tara Agencies
  ('b0000000-0000-0000-0000-000000000035', 'a0000000-0000-0000-0000-000000000009', 'MT-521', CURRENT_DATE - 5, CURRENT_DATE + 5, 24746.36, 618.66, 618.66, 0.00, 25983.68, 'unpaid', NULL, (CURRENT_DATE - 5) + TIME '14:20'),
  -- invoice 36: Rajdhani Snacks Supply
  ('b0000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000007', 'RS000607', CURRENT_DATE - 4, CURRENT_DATE + 11, 11445.09, 0.00, 0.00, 1373.41, 12818.50, 'unpaid', NULL, (CURRENT_DATE - 4) + TIME '10:56'),
  -- invoice 37: Eastern Dairy & Beverages
  ('b0000000-0000-0000-0000-000000000037', 'a0000000-0000-0000-0000-000000000004', 'EDB/INV/00900', CURRENT_DATE - 3, CURRENT_DATE + 27, 25571.07, 1381.66, 1381.66, 0.00, 28334.39, 'unpaid', NULL, (CURRENT_DATE - 3) + TIME '11:43'),
  -- invoice 38: Bengal Grain Traders  <-- DUPLICATE: D1 same vendor + same invoice number + same date and amount (scanned twice)
  ('b0000000-0000-0000-0000-000000000038', 'a0000000-0000-0000-0000-000000000001', 'BGT/26-27/0610', CURRENT_DATE - 10, CURRENT_DATE + 5, 25506.38, 570.43, 570.43, 0.00, 26647.24, 'unpaid', NULL, (CURRENT_DATE - 9) + TIME '09:40'),
  -- invoice 39: Eastern Dairy & Beverages  <-- DUPLICATE: D2 same vendor + same invoice number (date misread by 1 day)
  ('b0000000-0000-0000-0000-000000000039', 'a0000000-0000-0000-0000-000000000004', 'EDB/INV/00889', CURRENT_DATE - 27, CURRENT_DATE + 3, 28680.92, 1373.85, 1373.85, 0.00, 31428.62, 'unpaid', NULL, (CURRENT_DATE - 27) + TIME '10:15'),
  -- invoice 40: Kolkata Plastic & Household  <-- DUPLICATE: D3 same vendor + same amount + same date (invoice number digits swapped)
  ('b0000000-0000-0000-0000-000000000040', 'a0000000-0000-0000-0000-000000000008', 'KPH/0279', CURRENT_DATE - 49, CURRENT_DATE - 19, 9108.37, 819.76, 819.76, 0.00, 10747.89, 'unpaid', NULL, (CURRENT_DATE - 47) + TIME '16:05');

-- ---------------- INVOICE ITEMS ----------------
-- columns: invoice_id, item_name (as printed), quantity, unit, unit_price, line_total
INSERT INTO invoice_items (invoice_id, item_name, quantity, unit, unit_price, line_total) VALUES
  -- invoice 1: Eastern Dairy & Beverages EDB/INV/00823
  ('b0000000-0000-0000-0000-000000000001', 'Amul Ghee 1L', 9, 'pouch', 600.00, 5400.00),
  ('b0000000-0000-0000-0000-000000000001', 'Red Label Tea 500g', 23, 'pkt', 245.00, 5635.00),
  ('b0000000-0000-0000-0000-000000000001', 'Bournvita 500g', 17, 'jar', 268.00, 4556.00),
  -- invoice 2: Bengal Grain Traders BGT/26-27/0518
  ('b0000000-0000-0000-0000-000000000002', 'Aashirvaad Atta 10kg', 5, 'bag', 448.00, 2240.00),
  ('b0000000-0000-0000-0000-000000000002', 'Gobindobhog Rice 25kg', 6, 'bag', 1650.00, 9900.00),
  ('b0000000-0000-0000-0000-000000000002', 'Masoor Dal', 55, 'kg', 86.00, 4730.00),
  ('b0000000-0000-0000-0000-000000000002', 'Sugar', 85, 'kg', 43.00, 3655.00),
  ('b0000000-0000-0000-0000-000000000002', 'Tata Salt 1kg', 76, 'pkt', 25.50, 1938.00),
  -- invoice 3: Mahavir Distributors MD/497/26
  ('b0000000-0000-0000-0000-000000000003', 'Maggi 2-Minute Noodles Box', 3, 'box', 640.00, 1920.00),
  ('b0000000-0000-0000-0000-000000000003', 'Kissan Mixed Fruit Jam 500g', 25, 'bottle', 158.00, 3950.00),
  ('b0000000-0000-0000-0000-000000000003', 'Quaker Oats 1kg', 9, 'pkt', 192.00, 1728.00),
  -- invoice 4: Ma Tara Agencies MT-417
  ('b0000000-0000-0000-0000-000000000004', 'GOBINDOBHOG RICE 25KG', 8, 'bag', 1620.00, 12960.00),
  ('b0000000-0000-0000-0000-000000000004', 'MASOOR DAL', 25, 'kg', 83.00, 2075.00),
  ('b0000000-0000-0000-0000-000000000004', 'TATA SALT 1KG', 74, 'pkt', 25.00, 1850.00),
  ('b0000000-0000-0000-0000-000000000004', 'MUSTARD OIL 1L POUCH', 38, 'pouch', 170.00, 6460.00),
  -- invoice 5: Shree Ganesh Oil & Spices SGO-672
  ('b0000000-0000-0000-0000-000000000005', 'Mustard Oil 1L Pouch', 91, 'pouch', 164.00, 14924.00),
  ('b0000000-0000-0000-0000-000000000005', 'Turmeric Powder 200g', 50, 'pkt', 37.00, 1850.00),
  ('b0000000-0000-0000-0000-000000000005', 'Cumin Seeds 100g', 22, 'pkt', 58.00, 1276.00),
  ('b0000000-0000-0000-0000-000000000005', 'Panch Phoron 100g', 40, 'pkt', 34.00, 1360.00),
  -- invoice 6: Howrah Wholesale Mart HWM/00178
  ('b0000000-0000-0000-0000-000000000006', 'LIFEBUOY SOAP 100G', 223, 'pcs', 27.00, 6021.00),
  ('b0000000-0000-0000-0000-000000000006', 'SURF EXCEL EASY WASH 1KG', 69, 'pkt', 128.00, 8832.00),
  ('b0000000-0000-0000-0000-000000000006', 'MAGGI 2-MINUTE NOODLES BOX', 2, 'box', 655.00, 1310.00),
  ('b0000000-0000-0000-0000-000000000006', 'HALDIRAM ALOO BHUJIA 400G', 16, 'pkt', 101.00, 1616.00),
  -- invoice 7: Sonar Bangla Stationers SBS-26-273
  ('b0000000-0000-0000-0000-000000000007', 'Classmate Notebook 172pg', 147, 'pcs', 46.00, 6762.00),
  ('b0000000-0000-0000-0000-000000000007', 'Camlin Geometry Box', 16, 'pcs', 68.00, 1088.00),
  ('b0000000-0000-0000-0000-000000000007', 'Fevicol 100g', 47, 'pcs', 39.00, 1833.00),
  ('b0000000-0000-0000-0000-000000000007', 'Apsara Pencil Box of 10', 23, 'box', 48.00, 1104.00),
  -- invoice 8: Kolkata Plastic & Household KPH/0257
  ('b0000000-0000-0000-0000-000000000008', 'Plastic Bucket 16L', 24, 'pcs', 118.00, 2832.00),
  ('b0000000-0000-0000-0000-000000000008', 'Plastic Mug 1L', 81, 'pcs', 24.00, 1944.00),
  ('b0000000-0000-0000-0000-000000000008', 'Plastic Dustbin 10L', 15, 'pcs', 178.00, 2670.00),
  ('b0000000-0000-0000-0000-000000000008', 'Water Jug 2L', 21, 'pcs', 62.00, 1302.00),
  -- invoice 9: Eastern Dairy & Beverages EDB/INV/00854
  ('b0000000-0000-0000-0000-000000000009', 'Amul Ghee 1L', 22, 'pouch', 603.50, 13277.00),
  ('b0000000-0000-0000-0000-000000000009', 'Red Label Tea 500g', 20, 'pkt', 242.10, 4842.00),
  ('b0000000-0000-0000-0000-000000000009', 'Amul Butter 500g', 10, 'pkt', 286.86, 2868.60),
  ('b0000000-0000-0000-0000-000000000009', 'Nescafe Classic 50g', 30, 'jar', 163.17, 4895.10),
  ('b0000000-0000-0000-0000-000000000009', 'Bournvita 500g', 14, 'jar', 272.00, 3808.00),
  -- invoice 10: Bengal Grain Traders BGT/26-27/0546
  ('b0000000-0000-0000-0000-000000000010', 'Masoor Dal', 50, 'kg', 87.26, 4363.00),
  ('b0000000-0000-0000-0000-000000000010', 'Sugar', 105, 'kg', 42.65, 4478.25),
  ('b0000000-0000-0000-0000-000000000010', 'Tata Salt 1kg', 51, 'pkt', 25.79, 1315.29),
  -- invoice 11: Ma Tara Agencies MT-427
  ('b0000000-0000-0000-0000-000000000011', 'GOBINDOBHOG RICE 25KG', 4, 'bag', 1666.30, 6665.20),
  ('b0000000-0000-0000-0000-000000000011', 'MASOOR DAL', 25, 'kg', 85.37, 2134.25),
  ('b0000000-0000-0000-0000-000000000011', 'TATA SALT 1KG', 103, 'pkt', 25.20, 2595.60),
  ('b0000000-0000-0000-0000-000000000011', 'MUSTARD OIL 1L POUCH', 60, 'pouch', 172.21, 10332.60),
  ('b0000000-0000-0000-0000-000000000011', 'MOONG DAL', 35, 'kg', 120.64, 4222.40),
  -- invoice 12: Mahavir Distributors MD/515/26
  ('b0000000-0000-0000-0000-000000000012', 'Maggi 2-Minute Noodles Box', 6, 'box', 651.67, 3910.02),
  ('b0000000-0000-0000-0000-000000000012', 'Kissan Mixed Fruit Jam 500g', 18, 'bottle', 156.19, 2811.42),
  ('b0000000-0000-0000-0000-000000000012', 'Tops Tomato Ketchup 1kg', 20, 'bottle', 120.43, 2408.60),
  ('b0000000-0000-0000-0000-000000000012', 'Quaker Oats 1kg', 14, 'pkt', 190.28, 2663.92),
  ('b0000000-0000-0000-0000-000000000012', 'Kelloggs Corn Flakes 500g', 19, 'pkt', 208.58, 3963.02),
  -- invoice 13: Shree Ganesh Oil & Spices SGO-687
  ('b0000000-0000-0000-0000-000000000013', 'Mustard Oil 1L Pouch', 87, 'pouch', 166.96, 14525.52),
  ('b0000000-0000-0000-0000-000000000013', 'Turmeric Powder 200g', 49, 'pkt', 37.21, 1823.29),
  ('b0000000-0000-0000-0000-000000000013', 'Panch Phoron 100g', 20, 'pkt', 34.24, 684.80),
  -- invoice 14: Rajdhani Snacks Supply RS000555
  ('b0000000-0000-0000-0000-000000000014', 'Haldiram Aloo Bhujia 400g', 33, 'pkt', 98.00, 3234.00),
  ('b0000000-0000-0000-0000-000000000014', 'Haldiram Moong Dal 200g', 70, 'pkt', 49.00, 3430.00),
  ('b0000000-0000-0000-0000-000000000014', 'Bikaji Bhujia 1kg', 22, 'pkt', 208.00, 4576.00),
  ('b0000000-0000-0000-0000-000000000014', 'Haldiram Soan Papdi 250g', 22, 'pkt', 72.00, 1584.00),
  -- invoice 15: Howrah Wholesale Mart HWM/00195
  ('b0000000-0000-0000-0000-000000000015', 'LIFEBUOY SOAP 100G', 199, 'pcs', 27.00, 5373.00),
  ('b0000000-0000-0000-0000-000000000015', 'SURF EXCEL EASY WASH 1KG', 41, 'pkt', 128.69, 5276.29),
  ('b0000000-0000-0000-0000-000000000015', 'MAGGI 2-MINUTE NOODLES BOX', 5, 'box', 660.46, 3302.30),
  -- invoice 16: Eastern Dairy & Beverages EDB/INV/00879
  ('b0000000-0000-0000-0000-000000000016', 'Amul Ghee 1L', 19, 'pouch', 601.88, 11435.72),
  ('b0000000-0000-0000-0000-000000000016', 'Red Label Tea 500g', 18, 'pkt', 256.52, 4617.36),
  ('b0000000-0000-0000-0000-000000000016', 'Amul Butter 500g', 12, 'pkt', 291.55, 3498.60),
  ('b0000000-0000-0000-0000-000000000016', 'Amul Milk Powder 500g', 6, 'pkt', 244.32, 1465.92),
  -- invoice 17: Bengal Grain Traders BGT/26-27/0562
  ('b0000000-0000-0000-0000-000000000017', 'Gobindobhog Rice 25kg', 6, 'bag', 1628.75, 9772.50),
  ('b0000000-0000-0000-0000-000000000017', 'Moong Dal', 25, 'kg', 120.55, 3013.75),
  ('b0000000-0000-0000-0000-000000000017', 'Sugar', 105, 'kg', 43.32, 4548.60),
  ('b0000000-0000-0000-0000-000000000017', 'Tata Salt 1kg', 112, 'pkt', 26.07, 2919.84),
  -- invoice 18: Ma Tara Agencies MT-457
  ('b0000000-0000-0000-0000-000000000018', 'GOBINDOBHOG RICE 25KG', 7, 'bag', 1721.60, 12051.20),
  ('b0000000-0000-0000-0000-000000000018', 'MASOOR DAL', 30, 'kg', 87.72, 2631.60),
  ('b0000000-0000-0000-0000-000000000018', 'MOONG DAL', 15, 'kg', 122.75, 1841.25),
  -- invoice 19: Sonar Bangla Stationers SBS-26-289
  ('b0000000-0000-0000-0000-000000000019', 'Classmate Notebook 172pg', 137, 'pcs', 46.03, 6306.11),
  ('b0000000-0000-0000-0000-000000000019', 'Reynolds Ball Pen Box of 10', 10, 'box', 93.94, 939.40),
  ('b0000000-0000-0000-0000-000000000019', 'Camlin Geometry Box', 23, 'pcs', 67.86, 1560.78),
  -- invoice 20: Kolkata Plastic & Household KPH/0297
  ('b0000000-0000-0000-0000-000000000020', 'Plastic Bucket 16L', 33, 'pcs', 117.05, 3862.65),
  ('b0000000-0000-0000-0000-000000000020', 'Storage Container Set of 3', 13, 'set', 259.24, 3370.12),
  ('b0000000-0000-0000-0000-000000000020', 'Water Jug 2L', 30, 'pcs', 62.52, 1875.60),
  -- invoice 21: Shree Ganesh Oil & Spices SGO-701
  ('b0000000-0000-0000-0000-000000000021', 'Mustard Oil 1L Pouch', 99, 'pouch', 167.42, 16574.58),
  ('b0000000-0000-0000-0000-000000000021', 'Refined Soyabean Oil 1L', 37, 'pouch', 130.91, 4843.67),
  ('b0000000-0000-0000-0000-000000000021', 'Turmeric Powder 200g', 41, 'pkt', 37.39, 1532.99),
  ('b0000000-0000-0000-0000-000000000021', 'Cumin Seeds 100g', 44, 'pkt', 58.58, 2577.52),
  ('b0000000-0000-0000-0000-000000000021', 'Red Chilli Powder 200g', 40, 'pkt', 52.54, 2101.60),
  -- invoice 22: Mahavir Distributors MD/553/26
  ('b0000000-0000-0000-0000-000000000022', 'Maggi 2-Minute Noodles Box', 3, 'box', 661.28, 1983.84),
  ('b0000000-0000-0000-0000-000000000022', 'Kissan Mixed Fruit Jam 500g', 30, 'bottle', 157.19, 4715.70),
  ('b0000000-0000-0000-0000-000000000022', 'Tops Tomato Ketchup 1kg', 23, 'bottle', 119.55, 2749.65),
  ('b0000000-0000-0000-0000-000000000022', 'Quaker Oats 1kg', 12, 'pkt', 189.16, 2269.92),
  ('b0000000-0000-0000-0000-000000000022', 'Kelloggs Corn Flakes 500g', 23, 'pkt', 211.92, 4874.16),
  -- invoice 23: Howrah Wholesale Mart HWM/00209
  ('b0000000-0000-0000-0000-000000000023', 'LIFEBUOY SOAP 100G', 144, 'pcs', 27.38, 3942.72),
  ('b0000000-0000-0000-0000-000000000023', 'SURF EXCEL EASY WASH 1KG', 40, 'pkt', 119.57, 4782.80),
  ('b0000000-0000-0000-0000-000000000023', 'COLGATE STRONG TEETH 150G', 65, 'pcs', 83.26, 5411.90),
  ('b0000000-0000-0000-0000-000000000023', 'HALDIRAM ALOO BHUJIA 400G', 27, 'pkt', 100.62, 2716.74),
  -- invoice 24: Rajdhani Snacks Supply RS000576
  ('b0000000-0000-0000-0000-000000000024', 'Haldiram Moong Dal 200g', 46, 'pkt', 49.92, 2296.32),
  ('b0000000-0000-0000-0000-000000000024', 'Bikaji Bhujia 1kg', 14, 'pkt', 211.51, 2961.14),
  ('b0000000-0000-0000-0000-000000000024', 'Haldiram Soan Papdi 250g', 24, 'pkt', 71.89, 1725.36),
  -- invoice 25: Bengal Grain Traders BGT/26-27/0572
  ('b0000000-0000-0000-0000-000000000025', 'Aashirvaad Atta 10kg', 10, 'bag', 449.11, 4491.10),
  ('b0000000-0000-0000-0000-000000000025', 'Gobindobhog Rice 25kg', 5, 'bag', 1642.48, 8212.40),
  ('b0000000-0000-0000-0000-000000000025', 'Masoor Dal', 30, 'kg', 88.96, 2668.80),
  ('b0000000-0000-0000-0000-000000000025', 'Sugar', 110, 'kg', 48.42, 5326.20),
  ('b0000000-0000-0000-0000-000000000025', 'Tata Salt 1kg', 69, 'pkt', 25.95, 1790.55),
  -- invoice 26: Eastern Dairy & Beverages EDB/INV/00889
  ('b0000000-0000-0000-0000-000000000026', 'Amul Ghee 1L', 23, 'pouch', 674.15, 15505.45),
  ('b0000000-0000-0000-0000-000000000026', 'Red Label Tea 500g', 28, 'pkt', 257.40, 7207.20),
  ('b0000000-0000-0000-0000-000000000026', 'Amul Butter 500g', 11, 'pkt', 296.44, 3260.84),
  ('b0000000-0000-0000-0000-000000000026', 'Amul Milk Powder 500g', 11, 'pkt', 246.13, 2707.43),
  -- invoice 27: Ma Tara Agencies MT-482
  ('b0000000-0000-0000-0000-000000000027', 'GOBINDOBHOG RICE 25KG', 6, 'bag', 1775.41, 10652.46),
  ('b0000000-0000-0000-0000-000000000027', 'MASOOR DAL', 60, 'kg', 90.33, 5419.80),
  ('b0000000-0000-0000-0000-000000000027', 'MUSTARD OIL 1L POUCH', 59, 'pouch', 172.53, 10179.27),
  -- invoice 28: Shree Ganesh Oil & Spices SGO-741
  ('b0000000-0000-0000-0000-000000000028', 'Mustard Oil 1L Pouch', 94, 'pouch', 198.83, 18690.02),
  ('b0000000-0000-0000-0000-000000000028', 'Refined Soyabean Oil 1L', 38, 'pouch', 132.00, 5016.00),
  ('b0000000-0000-0000-0000-000000000028', 'Turmeric Powder 200g', 22, 'pkt', 38.11, 838.42),
  ('b0000000-0000-0000-0000-000000000028', 'Panch Phoron 100g', 33, 'pkt', 35.45, 1169.85),
  ('b0000000-0000-0000-0000-000000000028', 'Red Chilli Powder 200g', 41, 'pkt', 53.14, 2178.74),
  -- invoice 29: Kolkata Plastic & Household KPH/0311
  ('b0000000-0000-0000-0000-000000000029', 'Plastic Bucket 16L', 17, 'pcs', 141.97, 2413.49),
  ('b0000000-0000-0000-0000-000000000029', 'Plastic Mug 1L', 89, 'pcs', 24.63, 2192.07),
  ('b0000000-0000-0000-0000-000000000029', 'Storage Container Set of 3', 12, 'set', 256.69, 3080.28),
  ('b0000000-0000-0000-0000-000000000029', 'Plastic Dustbin 10L', 14, 'pcs', 178.78, 2502.92),
  -- invoice 30: Sonar Bangla Stationers SBS-26-322
  ('b0000000-0000-0000-0000-000000000030', 'Classmate Notebook 172pg', 106, 'pcs', 46.27, 4904.62),
  ('b0000000-0000-0000-0000-000000000030', 'Reynolds Ball Pen Box of 10', 27, 'box', 93.62, 2527.74),
  ('b0000000-0000-0000-0000-000000000030', 'A4 Paper Ream 500 Sheets', 10, 'ream', 232.50, 2325.00),
  ('b0000000-0000-0000-0000-000000000030', 'Apsara Pencil Box of 10', 54, 'box', 48.57, 2622.78),
  -- invoice 31: Howrah Wholesale Mart HWM/00247
  ('b0000000-0000-0000-0000-000000000031', 'SURF EXCEL EASY WASH 1KG', 54, 'pkt', 119.37, 6445.98),
  ('b0000000-0000-0000-0000-000000000031', 'COLGATE STRONG TEETH 150G', 64, 'pcs', 84.95, 5436.80),
  ('b0000000-0000-0000-0000-000000000031', 'RED LABEL TEA 500G', 13, 'pkt', 253.98, 3301.74),
  -- invoice 32: Bengal Grain Traders BGT/26-27/0610
  ('b0000000-0000-0000-0000-000000000032', 'Gobindobhog Rice 25kg', 4, 'bag', 1653.86, 6615.44),
  ('b0000000-0000-0000-0000-000000000032', 'Masoor Dal', 55, 'kg', 90.22, 4962.10),
  ('b0000000-0000-0000-0000-000000000032', 'Moong Dal', 40, 'kg', 121.15, 4846.00),
  ('b0000000-0000-0000-0000-000000000032', 'Sugar', 130, 'kg', 49.18, 6393.40),
  ('b0000000-0000-0000-0000-000000000032', 'Tata Salt 1kg', 104, 'pkt', 25.86, 2689.44),
  -- invoice 33: Mahavir Distributors MD/588/26
  ('b0000000-0000-0000-0000-000000000033', 'Maggi 2-Minute Noodles Box', 4, 'box', 740.78, 2963.12),
  ('b0000000-0000-0000-0000-000000000033', 'Kissan Mixed Fruit Jam 500g', 21, 'bottle', 157.54, 3308.34),
  ('b0000000-0000-0000-0000-000000000033', 'Tops Tomato Ketchup 1kg', 27, 'bottle', 120.67, 3258.09),
  -- invoice 34: Shree Ganesh Oil & Spices SGO-758
  ('b0000000-0000-0000-0000-000000000034', 'Mustard Oil 1L Pouch', 96, 'pouch', 198.26, 19032.96),
  ('b0000000-0000-0000-0000-000000000034', 'Refined Soyabean Oil 1L', 32, 'pouch', 132.47, 4239.04),
  ('b0000000-0000-0000-0000-000000000034', 'Turmeric Powder 200g', 32, 'pkt', 37.99, 1215.68),
  ('b0000000-0000-0000-0000-000000000034', 'Cumin Seeds 100g', 20, 'pkt', 60.44, 1208.80),
  ('b0000000-0000-0000-0000-000000000034', 'Panch Phoron 100g', 50, 'pkt', 35.41, 1770.50),
  -- invoice 35: Ma Tara Agencies MT-521
  ('b0000000-0000-0000-0000-000000000035', 'GOBINDOBHOG RICE 25KG', 8, 'bag', 1828.57, 14628.56),
  ('b0000000-0000-0000-0000-000000000035', 'MASOOR DAL', 35, 'kg', 93.30, 3265.50),
  ('b0000000-0000-0000-0000-000000000035', 'SUGAR', 55, 'kg', 46.20, 2541.00),
  ('b0000000-0000-0000-0000-000000000035', 'MOONG DAL', 35, 'kg', 123.18, 4311.30),
  -- invoice 36: Rajdhani Snacks Supply RS000607
  ('b0000000-0000-0000-0000-000000000036', 'Haldiram Aloo Bhujia 400g', 44, 'pkt', 98.35, 4327.40),
  ('b0000000-0000-0000-0000-000000000036', 'Haldiram Moong Dal 200g', 58, 'pkt', 50.22, 2912.76),
  ('b0000000-0000-0000-0000-000000000036', 'Bikaji Bhujia 1kg', 14, 'pkt', 213.98, 2995.72),
  ('b0000000-0000-0000-0000-000000000036', 'Haldiram Soan Papdi 250g', 17, 'pkt', 71.13, 1209.21),
  -- invoice 37: Eastern Dairy & Beverages EDB/INV/00900
  ('b0000000-0000-0000-0000-000000000037', 'Amul Ghee 1L', 12, 'pouch', 670.97, 8051.64),
  ('b0000000-0000-0000-0000-000000000037', 'Red Label Tea 500g', 29, 'pkt', 257.21, 7459.09),
  ('b0000000-0000-0000-0000-000000000037', 'Bournvita 500g', 26, 'jar', 272.53, 7085.78),
  ('b0000000-0000-0000-0000-000000000037', 'Amul Milk Powder 500g', 12, 'pkt', 247.88, 2974.56),
  -- invoice 38: Bengal Grain Traders BGT/26-27/0610
  ('b0000000-0000-0000-0000-000000000038', 'Gobindobhog Rice 25kg', 4, 'bag', 1653.86, 6615.44),
  ('b0000000-0000-0000-0000-000000000038', 'Masoor Dal', 55, 'kg', 90.22, 4962.10),
  ('b0000000-0000-0000-0000-000000000038', 'Moong Dal', 40, 'kg', 121.15, 4846.00),
  ('b0000000-0000-0000-0000-000000000038', 'Sugar', 130, 'kg', 49.18, 6393.40),
  ('b0000000-0000-0000-0000-000000000038', 'Tata Salt 1kg', 104, 'pkt', 25.86, 2689.44),
  -- invoice 39: Eastern Dairy & Beverages EDB/INV/00889
  ('b0000000-0000-0000-0000-000000000039', 'Amul Ghee 1L', 23, 'pouch', 674.15, 15505.45),
  ('b0000000-0000-0000-0000-000000000039', 'Red Label Tea 500g', 28, 'pkt', 257.40, 7207.20),
  ('b0000000-0000-0000-0000-000000000039', 'Amul Butter 500g', 11, 'pkt', 296.44, 3260.84),
  ('b0000000-0000-0000-0000-000000000039', 'Amul Milk Powder 500g', 11, 'pkt', 246.13, 2707.43),
  -- invoice 40: Kolkata Plastic & Household KPH/0279
  ('b0000000-0000-0000-0000-000000000040', 'Plastic Bucket 16L', 33, 'pcs', 117.05, 3862.65),
  ('b0000000-0000-0000-0000-000000000040', 'Storage Container Set of 3', 13, 'set', 259.24, 3370.12),
  ('b0000000-0000-0000-0000-000000000040', 'Water Jug 2L', 30, 'pcs', 62.52, 1875.60);
