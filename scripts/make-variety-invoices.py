"""Makes 8 made-up invoices that look different from each other, plus the right answers for each one.

  python scripts/make-variety-invoices.py            (needs:  pip install pillow ; Windows fonts)

Output (test-invoices/variety/):  7 images, bilingual.html (turn it into an image with Edge, see the end of
this file), and expected.json. scripts/test-variety.mjs scans every image and compares with expected.json.

What the 8 styles try to break:
  thermal-receipt     narrow shop receipt, 2-digit year, round-off line
  tax-inclusive       prices already include GST, date written as 27-Oct-2026
  multi-gst-rates     5%, 12% and 18% lines on one bill, tax summary per rate
  discount-roundoff   a discount column, so price x qty is not the line amount
  handwritten-style   handwriting-like font on ruled paper, no tax, no GSTIN
  phone-photo         a normal invoice photographed at an angle: tilted, shaded, blurred, low quality
  igst-einvoice       other-state sale (IGST only) with a long IRN code and a QR block that must not
                      be taken for the invoice number
  bilingual           Bengali and Hindi headings mixed with English (made by Edge from bilingual.html)
"""
import json
import os
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join("test-invoices", "variety")
os.makedirs(OUT, exist_ok=True)
FONTS = r"C:\Windows\Fonts"
ARIAL, ARIAL_B, COUR, COUR_B, INK = "arial.ttf", "arialbd.ttf", "cour.ttf", "courbd.ttf", "Inkfree.ttf"
EXPECTED = {}


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def money(v):
    return "{:,.2f}".format(v)


def table(d, left, right, y, edges, heads, rows, aligns, size=26, row_h=58):
    """Draws a table. edges = x positions of the column borders (one more than the columns)."""
    d.rectangle((left, y, right, y + row_h - 6), fill="#e8e8e8")

    def put(text, i, yy, fnt):
        if aligns[i] == "r":
            d.text((edges[i + 1] - 8, yy), text, font=fnt, fill="black", anchor="ra")
        else:
            d.text((edges[i] + 8, yy), text, font=fnt, fill="black")

    for i, h in enumerate(heads):
        put(h, i, y + 10, font(ARIAL_B, size))
    y += row_h - 6
    for r in rows:
        for i, v in enumerate(r):
            put(v, i, y + 12, font(ARIAL, size))
        y += row_h
        d.line((left, y, right, y), fill="#bbbbbb", width=2)
    return y


def totals(d, y, pairs, x_label, x_value, size=28):
    for label, value, bold in pairs:
        fnt = font(ARIAL_B if bold else ARIAL, size)
        d.text((x_label, y), label, font=fnt, fill="black")
        d.text((x_value, y), value, font=fnt, fill="black", anchor="ra")
        y += size + 20
    return y


def save(img, name, quality=90):
    img.convert("RGB").save(os.path.join(OUT, name), quality=quality)


# ---------------------------------------------------------------- 1. thermal receipt
def thermal():
    lines = ["MAA TARA MART", "Station Road, Bally, Howrah", "GSTIN: 19AABCM2468K1Z3", "-" * 40,
             "BILL NO: 4587", "DATE: 29-10-26  14:32", "-" * 40,
             "ITEM                QTY    RATE   AMOUNT", "-" * 40]
    items = [("PARLE-G 800G", 4, 62.00), ("LUX SOAP", 6, 38.00), ("SURF EXCEL 1KG", 2, 215.00), ("TATA SALT 1KG", 10, 28.00)]
    sub = 0.0
    for name, q, r in items:
        a = q * r
        sub += a
        lines.append("{:<20}{:>3} {:>7} {:>8}".format(name, q, "%.2f" % r, "%.2f" % a))
    cg = round(sub * 0.025, 2)
    lines += ["-" * 40, "{:<30}{:>10}".format("SUB TOTAL", "%.2f" % sub), "{:<30}{:>10}".format("CGST 2.5%", "%.2f" % cg),
              "{:<30}{:>10}".format("SGST 2.5%", "%.2f" % cg), "{:<30}{:>10}".format("ROUND OFF", "-0.30"),
              "=" * 40, "{:<30}{:>10}".format("NET AMOUNT", "1245.00"), "=" * 40, "", "THANK YOU, VISIT AGAIN"]
    f = font(COUR_B, 23)
    img = Image.new("RGB", (580, 40 + 34 * len(lines)), "#f6f4ee")
    d = ImageDraw.Draw(img)
    for i, t in enumerate(lines):
        d.text((24, 20 + 34 * i), t, font=f, fill="#222222")
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    save(img, "thermal-receipt.jpg", 82)
    EXPECTED["thermal-receipt.jpg"] = dict(vendor_contains=["MAA TARA"], invoice_number="4587", invoice_date="2026-10-29",
        total_amount=1245.0, subtotal=1186.0, cgst=29.65, sgst=29.65, igst=0.0,
        lines=[dict(qty=4, unit_price=62.0), dict(qty=6, unit_price=38.0), dict(qty=2, unit_price=215.0), dict(qty=10, unit_price=28.0)])


# ---------------------------------------------------------------- 2. tax inclusive
def tax_inclusive():
    img = Image.new("RGB", (1240, 1200), "white")
    d = ImageDraw.Draw(img)
    d.text((60, 50), "NEW BENGAL DISTRIBUTORS", font=font(ARIAL_B, 42), fill="black")
    d.text((60, 105), "GSTIN: 19AAKCN5566L1Z8   |   Dum Dum, Kolkata", font=font(ARIAL, 26), fill="black")
    d.text((880, 55), "INVOICE", font=font(ARIAL_B, 38), fill="black")
    d.text((60, 170), "Invoice No: NBD-2210", font=font(ARIAL_B, 28), fill="black")
    d.text((60, 210), "Date: 27-Oct-2026", font=font(ARIAL, 28), fill="black")
    rows = [("1", "Hair Oil 200ml", "12", "105.00", "1,260.00"), ("2", "Biscuit Family Pack", "20", "52.50", "1,050.00"),
            ("3", "Detergent 1kg", "10", "105.00", "1,050.00")]
    y = table(d, 60, 1180, 290, [60, 120, 640, 760, 980, 1180], ["#", "Item", "Qty", "MRP (incl. GST)", "Amount"], rows,
              ["l", "l", "r", "r", "r"])
    y = totals(d, y + 30, [("Total (inclusive of all taxes)", "Rs. 3,360.00", True)], 560, 1180)
    d.text((60, y + 30), "GST summary (12% included in the prices above)", font=font(ARIAL_B, 26), fill="black")
    y = table(d, 60, 1180, y + 70, [60, 420, 800, 1180], ["Taxable value", "CGST 6%", "SGST 6%"],
              [("3,000.00", "180.00", "180.00")], ["r", "r", "r"], size=26)
    save(img, "tax-inclusive.jpg")
    EXPECTED["tax-inclusive.jpg"] = dict(vendor_contains=["NEW BENGAL"], invoice_number="NBD-2210", invoice_date="2026-10-27",
        total_amount=3360.0, subtotal=3000.0, cgst=180.0, sgst=180.0, igst=0.0,
        lines=[dict(qty=12, unit_price=None), dict(qty=20, unit_price=None), dict(qty=10, unit_price=None)])


# ---------------------------------------------------------------- 3. several GST rates
def multi_gst():
    img = Image.new("RGB", (1240, 1450), "white")
    d = ImageDraw.Draw(img)
    d.text((60, 50), "KOLKATA FMCG WHOLESALE", font=font(ARIAL_B, 42), fill="black")
    d.text((60, 105), "GSTIN: 19AABCK7788M1Z2", font=font(ARIAL, 26), fill="black")
    d.text((860, 55), "TAX INVOICE", font=font(ARIAL_B, 38), fill="black")
    d.text((60, 170), "Invoice No: KFW/26-27/3305", font=font(ARIAL_B, 28), fill="black")
    d.text((60, 210), "Date: 25/10/2026", font=font(ARIAL, 28), fill="black")
    rows = [("Rice 25kg", "1006", "10", "1,800.00", "5%", "18,000.00"), ("Ghee 1L", "0405", "24", "600.00", "12%", "14,400.00"),
            ("Plastic Bucket 16L", "3924", "20", "150.00", "18%", "3,000.00")]
    y = table(d, 60, 1180, 290, [60, 460, 580, 700, 880, 980, 1180], ["Item", "HSN", "Qty", "Rate", "GST", "Amount"], rows,
              ["l", "l", "r", "r", "r", "r"])
    d.text((60, y + 30), "Tax summary", font=font(ARIAL_B, 26), fill="black")
    y = table(d, 60, 1180, y + 65, [60, 320, 640, 900, 1180], ["GST rate", "Taxable value", "CGST", "SGST"],
              [("5%", "18,000.00", "450.00", "450.00"), ("12%", "14,400.00", "864.00", "864.00"),
               ("18%", "3,000.00", "270.00", "270.00"), ("Total", "35,400.00", "1,584.00", "1,584.00")], ["l", "r", "r", "r"])
    y = totals(d, y + 30, [("Sub Total", "35,400.00", False), ("CGST", "1,584.00", False), ("SGST", "1,584.00", False),
                           ("Grand Total", "Rs. 38,568.00", True)], 700, 1180)
    save(img, "multi-gst-rates.jpg")
    EXPECTED["multi-gst-rates.jpg"] = dict(vendor_contains=["KOLKATA FMCG"], invoice_number="KFW/26-27/3305", invoice_date="2026-10-25",
        total_amount=38568.0, subtotal=35400.0, cgst=1584.0, sgst=1584.0, igst=0.0,
        lines=[dict(qty=10, unit_price=1800.0), dict(qty=24, unit_price=600.0), dict(qty=20, unit_price=150.0)])


# ---------------------------------------------------------------- 4. discount column and round-off
def discount():
    img = Image.new("RGB", (1240, 1250), "white")
    d = ImageDraw.Draw(img)
    d.text((60, 50), "SONAR TRADE LINKS", font=font(ARIAL_B, 42), fill="black")
    d.text((60, 105), "GSTIN: 19AAFCS9911P1Z6", font=font(ARIAL, 26), fill="black")
    d.text((860, 55), "TAX INVOICE", font=font(ARIAL_B, 38), fill="black")
    d.text((60, 170), "Invoice No: STL-0771", font=font(ARIAL_B, 28), fill="black")
    d.text((60, 210), "Date: 24-10-2026", font=font(ARIAL, 28), fill="black")
    rows = [("Atta 10kg", "20", "400.00", "5%", "7,600.00"), ("Mustard Oil 15L Tin", "8", "2,200.00", "2%", "17,248.00"),
            ("Sugar 50kg", "6", "2,300.00", "0%", "13,800.00")]
    y = table(d, 60, 1180, 290, [60, 560, 700, 880, 1010, 1180], ["Item", "Qty", "Rate", "Disc.", "Amount"], rows,
              ["l", "r", "r", "r", "r"])
    y = totals(d, y + 30, [("Taxable value", "38,648.00", False), ("CGST 2.5%", "966.20", False), ("SGST 2.5%", "966.20", False),
                           ("Round off", "-0.40", False), ("Net payable", "Rs. 40,580.00", True)], 700, 1180)
    save(img, "discount-roundoff.jpg")
    EXPECTED["discount-roundoff.jpg"] = dict(vendor_contains=["SONAR TRADE"], invoice_number="STL-0771", invoice_date="2026-10-24",
        total_amount=40580.0, subtotal=38648.0, cgst=966.2, sgst=966.2, igst=0.0,
        lines=[dict(qty=20, unit_price=380.0), dict(qty=8, unit_price=2156.0), dict(qty=6, unit_price=2300.0)])


# ---------------------------------------------------------------- 5. handwriting-like
def handwritten():
    random.seed(3)
    img = Image.new("RGB", (1000, 1100), "#fbf8ef")
    d = ImageDraw.Draw(img)
    for y in range(120, 1100, 52):
        d.line((0, y, 1000, y), fill="#b9cbe0", width=2)
    d.line((90, 0, 90, 1100), fill="#e39a9a", width=3)

    def write(x, y, text, size=40):
        d.text((x + random.randint(-3, 3), y + random.randint(-4, 4)), text, font=font(INK, size), fill="#1a2a6c")

    write(120, 40, "Mahesh Kirana Store", 56)
    write(120, 128, "Bill No. 23")
    write(600, 128, "Date 28/10/26")
    write(120, 180, "Item")
    write(470, 180, "Qty")
    write(580, 180, "Rate")
    write(760, 180, "Amt")
    rows = [("Rice 5kg", "4", "300", "1200"), ("Dal 1kg", "6", "120", "720"), ("Oil 1L", "3", "160", "480")]
    y = 232
    for n, q, r, a in rows:
        write(120, y, n)
        write(480, y, q)
        write(580, y, r)
        write(760, y, a)
        y += 52
    write(560, y + 52, "Total   2400", 46)
    img = img.rotate(1.2, resample=Image.BICUBIC, fillcolor="#fbf8ef")
    save(img, "handwritten-style.jpg", 85)
    EXPECTED["handwritten-style.jpg"] = dict(vendor_contains=["MAHESH"], invoice_number="23", invoice_date="2026-10-28",
        total_amount=2400.0, subtotal=None, cgst=0.0, sgst=0.0, igst=0.0,
        lines=[dict(qty=4, unit_price=300.0), dict(qty=6, unit_price=120.0), dict(qty=3, unit_price=160.0)])


# ---------------------------------------------------------------- 6. phone photo of a normal invoice
def phone_photo():
    W, H = 1240, 1500
    src = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(src)
    d.text((60, 50), "SRI LAKSHMI TRADERS", font=font(ARIAL_B, 44), fill="black")
    d.text((60, 105), "12, Market Road, Howrah - 711101", font=font(ARIAL, 26), fill="black")
    d.text((60, 140), "GSTIN: 19ABCDE1234F1Z5   |   Phone: 98300 12345", font=font(ARIAL, 26), fill="black")
    d.text((W - 340, 60), "TAX INVOICE", font=font(ARIAL_B, 36), fill="black")
    d.line((60, 190, W - 60, 190), fill="black", width=3)
    d.text((60, 215), "Invoice No: SLT/2026/1042", font=font(ARIAL_B, 28), fill="black")
    d.text((60, 255), "Invoice Date: 28/10/2026", font=font(ARIAL, 28), fill="black")
    d.text((60, 295), "Payment Terms: Net 30 days", font=font(ARIAL, 28), fill="black")
    rows = [("1", "Basmati Rice Premium 25kg", "1006", "10", "1850.00", "18500.00"), ("2", "Sunflower Oil 15L Tin", "1512", "6", "2100.00", "12600.00"),
            ("3", "Toor Dal 30kg", "0713", "8", "3200.00", "25600.00"), ("4", "Sugar M-30 50kg", "1701", "5", "2300.00", "11500.00")]
    y = table(d, 60, W - 60, 370, [60, 120, 600, 720, 820, 1010, W - 60], ["#", "Description of goods", "HSN", "Qty", "Rate", "Amount"],
              rows, ["l", "l", "l", "r", "r", "r"])
    totals(d, y + 30, [("Sub Total", "Rs. 68,200.00", False), ("CGST @ 2.5%", "Rs. 1,705.00", False), ("SGST @ 2.5%", "Rs. 1,705.00", False),
                       ("Grand Total", "Rs. 71,610.00", True)], 700, W - 60)
    # make it look like a photo: tilt, desk background, uneven light, blur, low quality
    rot = src.convert("RGBA").rotate(4.5, expand=True, resample=Image.BICUBIC, fillcolor=(0, 0, 0, 0))
    desk = Image.new("RGB", (rot.width + 160, rot.height + 160), (92, 74, 58))
    desk = Image.blend(desk, Image.effect_noise(desk.size, 22).convert("RGB"), 0.18)
    desk.paste(rot, (80, 80), rot)
    light = Image.linear_gradient("L").resize(desk.size).rotate(25).point(lambda v: 140 + v * 115 // 255)
    desk = ImageChops.multiply(desk, Image.merge("RGB", (light, light, light)))
    desk = desk.filter(ImageFilter.GaussianBlur(1.3))
    desk = desk.resize((int(desk.width * 0.8), int(desk.height * 0.8)))
    save(desk, "phone-photo.jpg", 50)
    EXPECTED["phone-photo.jpg"] = dict(vendor_contains=["SRI LAKSHMI"], invoice_number="SLT/2026/1042", invoice_date="2026-10-28",
        total_amount=71610.0, subtotal=68200.0, cgst=1705.0, sgst=1705.0, igst=0.0,
        lines=[dict(qty=10, unit_price=1850.0), dict(qty=6, unit_price=2100.0), dict(qty=8, unit_price=3200.0), dict(qty=5, unit_price=2300.0)])


# ---------------------------------------------------------------- 7. other-state sale with an e-invoice block
def igst_einvoice():
    random.seed(7)
    img = Image.new("RGB", (1240, 1500), "white")
    d = ImageDraw.Draw(img)
    d.text((60, 50), "DELHI TECH SUPPLIES", font=font(ARIAL_B, 42), fill="black")
    d.text((60, 105), "GSTIN: 07AABCD1234E1Z9   |   Okhla, New Delhi", font=font(ARIAL, 26), fill="black")
    d.text((60, 160), "TAX INVOICE (e-Invoice)", font=font(ARIAL_B, 34), fill="black")
    d.text((60, 220), "Invoice No: EI/26-27/0098", font=font(ARIAL_B, 28), fill="black")
    d.text((60, 260), "Invoice Date: 26-10-2026", font=font(ARIAL, 28), fill="black")
    d.text((60, 300), "Place of supply: West Bengal (19)   |   Vehicle: WB 12 AB 1234", font=font(ARIAL, 24), fill="black")
    irn = "".join(random.choice("0123456789abcdef") for _ in range(64))
    d.text((60, 345), "IRN: " + irn[:32], font=font(COUR, 22), fill="black")
    d.text((60, 375), irn[32:], font=font(COUR, 22), fill="black")
    d.text((60, 410), "Ack No: 112610001234567    Ack Date: 26-10-2026 11:42:10", font=font(ARIAL, 24), fill="black")
    qx, qy, cell, n = 940, 90, 9, 25
    for i in range(n):
        for j in range(n):
            if random.random() < 0.5:
                d.rectangle((qx + i * cell, qy + j * cell, qx + (i + 1) * cell - 1, qy + (j + 1) * cell - 1), fill="black")
    for ox, oy in ((0, 0), (n - 7, 0), (0, n - 7)):
        d.rectangle((qx + ox * cell, qy + oy * cell, qx + (ox + 7) * cell, qy + (oy + 7) * cell), fill="white", outline="black", width=3)
        d.rectangle((qx + (ox + 2) * cell, qy + (oy + 2) * cell, qx + (ox + 5) * cell, qy + (oy + 5) * cell), fill="black")
    rows = [("1", "Laptop Bag", "4202", "10", "1,200.00", "12,000.00"), ("2", "Wireless Mouse", "8471", "25", "450.00", "11,250.00"),
            ("3", "USB Cable 1m", "8544", "50", "120.00", "6,000.00")]
    y = table(d, 60, 1180, 480, [60, 120, 600, 720, 820, 1010, 1180], ["#", "Description", "HSN", "Qty", "Rate", "Amount"], rows,
              ["l", "l", "l", "r", "r", "r"])
    totals(d, y + 30, [("Taxable value", "29,250.00", False), ("IGST 18%", "5,265.00", False), ("Total Invoice Value", "Rs. 34,515.00", True)], 640, 1180)
    save(img, "igst-einvoice.jpg")
    EXPECTED["igst-einvoice.jpg"] = dict(vendor_contains=["DELHI TECH"], invoice_number="EI/26-27/0098", invoice_date="2026-10-26",
        total_amount=34515.0, subtotal=29250.0, cgst=0.0, sgst=0.0, igst=5265.0,
        lines=[dict(qty=10, unit_price=1200.0), dict(qty=25, unit_price=450.0), dict(qty=50, unit_price=120.0)])


# ---------------------------------------------------------------- 8. Bengali + Hindi + English (made by the browser)
def bilingual():
    html = """<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:'Nirmala UI','Segoe UI',Arial,sans-serif;margin:0;padding:40px;width:820px;background:#fff;color:#000}
h1{margin:0 0 4px 0;font-size:34px} .s{font-size:18px;margin:2px 0} table{border-collapse:collapse;width:100%;margin-top:18px;font-size:19px}
th,td{border-bottom:1px solid #bbb;padding:10px 8px;text-align:left} th{background:#e8e8e8} td.n,th.n{text-align:right}
.t{margin-top:16px;font-size:20px;text-align:right} .t b{font-size:24px}</style></head><body>
<h1>শ্রী গণেশ ট্রেডার্স &nbsp;/&nbsp; SHREE GANESH TRADERS</h1>
<div class="s">GSTIN: 19AAHCS4455Q1Z1 &nbsp;|&nbsp; হাওড়া, পশ্চিমবঙ্গ</div>
<div class="s"><b>कर चालान / কর চালান / TAX INVOICE</b></div>
<div class="s">बिल नं. / চালান নং: <b>SGT/1187</b></div>
<div class="s">दिनांक / তারিখ: <b>27-10-2026</b></div>
<table><tr><th>क्र.</th><th>विवरण / বিবরণ (Description)</th><th class="n">मात्रा / পরিমাণ (Qty)</th><th class="n">दर / দর (Rate)</th><th class="n">राशि / টাকা (Amount)</th></tr>
<tr><td>1</td><td>सरसों का तेल / সরষের তেল (Mustard Oil 1L)</td><td class="n">20</td><td class="n">165.00</td><td class="n">3,300.00</td></tr>
<tr><td>2</td><td>चावल / চাল (Rice 25kg)</td><td class="n">4</td><td class="n">1,450.00</td><td class="n">5,800.00</td></tr></table>
<div class="t">उप-योग / সাব টোটাল: 9,100.00</div>
<div class="t">CGST 2.5%: 227.50 &nbsp;&nbsp; SGST 2.5%: 227.50</div>
<div class="t"><b>कुल / মোট (Total): ₹ 9,555.00</b></div></body></html>"""
    with open(os.path.join(OUT, "bilingual.html"), "w", encoding="utf-8") as fh:
        fh.write(html)
    EXPECTED["bilingual.png"] = dict(vendor_contains=["GANESH", "গণেশ"], invoice_number="SGT/1187", invoice_date="2026-10-27",
        total_amount=9555.0, subtotal=9100.0, cgst=227.5, sgst=227.5, igst=0.0,
        lines=[dict(qty=20, unit_price=165.0), dict(qty=4, unit_price=1450.0)])


for make in (thermal, tax_inclusive, multi_gst, discount, handwritten, phone_photo, igst_einvoice, bilingual):
    make()
with open(os.path.join(OUT, "expected.json"), "w", encoding="utf-8") as fh:
    json.dump(EXPECTED, fh, indent=2, ensure_ascii=False)
print("made", len(EXPECTED), "answers in", OUT)

# The bilingual page is turned into an image with Microsoft Edge (it shapes Bengali and Hindi correctly):
#   msedge --headless=new --disable-gpu --hide-scrollbars --window-size=900,1000 --screenshot=<out>\bilingual.png file:///<out>/bilingual.html
