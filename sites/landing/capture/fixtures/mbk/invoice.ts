/**
 * A fake, multi-line plumbing/HVAC invoice, rendered to HTML and then
 * screenshotted to PNG by the seed script (via Playwright's `page` fixture)
 * so it can be run through MyBookkeeper's real Claude vision extraction.
 * Every name, address, and dollar amount here is fictional.
 */
export const INVOICE_VENDOR = "Bayou City Plumbing & HVAC";
export const INVOICE_NUMBER = "BCPH-20260825-118";
export const INVOICE_DATE = "2026-08-25";
export const INVOICE_TOTAL = 1932.71;

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

const LINE_ITEMS: LineItem[] = [
  { description: "Emergency service call / diagnostic", qty: 1, unitPrice: 95.0 },
  { description: "50-gal gas water heater — Rheem Performance Platinum", qty: 1, unitPrice: 1245.0 },
  { description: "Labor — water heater installation (3.5 hrs @ $110/hr)", qty: 1, unitPrice: 385.0 },
  { description: "Old unit haul-away & disposal", qty: 1, unitPrice: 45.0 },
  { description: "City of Houston plumbing permit", qty: 1, unitPrice: 60.0 },
];

const SUBTOTAL = LINE_ITEMS.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
const SALES_TAX = 102.71; // 8.25% on the water heater unit only

export function renderInvoiceHtml(): string {
  const rows = LINE_ITEMS.map(
    (item) => `
      <tr>
        <td>${item.description}</td>
        <td class="num">${item.qty}</td>
        <td class="num">$${item.unitPrice.toFixed(2)}</td>
        <td class="num">$${(item.qty * item.unitPrice).toFixed(2)}</td>
      </tr>`,
  ).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1a1a;
    width: 850px;
    margin: 0;
    padding: 48px;
    background: #ffffff;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2b6cb0; padding-bottom: 16px; margin-bottom: 24px; }
  .company { font-size: 22px; font-weight: bold; color: #2b6cb0; }
  .company-sub { font-size: 12px; color: #555; margin-top: 4px; }
  .invoice-title { font-size: 28px; font-weight: bold; text-align: right; color: #1a1a1a; }
  .invoice-meta { font-size: 12px; text-align: right; color: #555; margin-top: 4px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 28px; }
  .party h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.05em; }
  .party p { margin: 0; font-size: 13px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; color: #888; border-bottom: 2px solid #ddd; padding: 8px 4px; }
  td { font-size: 13px; padding: 10px 4px; border-bottom: 1px solid #eee; }
  .num { text-align: right; }
  th.num { text-align: right; }
  .totals { width: 280px; margin-left: auto; margin-top: 12px; }
  .totals div { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
  .totals .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #1a1a1a; margin-top: 6px; padding-top: 8px; }
  .footer { margin-top: 36px; font-size: 12px; color: #555; border-top: 1px solid #ddd; padding-top: 12px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company">Bayou City Plumbing &amp; HVAC</div>
      <div class="company-sub">2210 Navigation Blvd, Houston, TX 77003<br>(713) 555-0148 &middot; billing@bayoucityplumbing.example</div>
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-meta">Invoice #${INVOICE_NUMBER}<br>Date: August 25, 2026</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h4>Bill To</h4>
      <p>Alex Rivera<br>Bayou Bend Duplex, Unit B<br>4821 Bayou Bend Ln<br>Houston, TX 77004</p>
    </div>
    <div class="party">
      <h4>Service Address</h4>
      <p>Bayou Bend Duplex, Unit B<br>4821 Bayou Bend Ln<br>Houston, TX 77004</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>$${SUBTOTAL.toFixed(2)}</span></div>
    <div><span>Sales Tax (8.25%, unit only)</span><span>$${SALES_TAX.toFixed(2)}</span></div>
    <div class="grand"><span>Total Due</span><span>$${INVOICE_TOTAL.toFixed(2)}</span></div>
  </div>

  <div class="footer">
    Payment terms: Due upon receipt. Paid via check #1042 on August 27, 2026.<br>
    Thank you for your business — Bayou City Plumbing &amp; HVAC, licensed &amp; insured, TX Lic. #PL-44921.
  </div>
</body>
</html>`;
}
