"""Demo PDF generators for non-tax documents: utility bills, invoices, receipts, payouts, and statements."""

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.services.demo.demo_generators.base import (
    draw_table,
    estimate_nights,
    fmt_num,
    get_usage_info,
    make_account_number,
    make_invoice_number,
    make_loan_number,
    month_name_from_date,
    vendor_address,
    vendor_contact,
)


class DemoDocumentPdfGenerator:
    """Generates realistic PDFs for non-tax documents: utility bills, invoices, receipts, payouts."""

    def generate(self, doc_data: dict, matched_transactions: list[dict]) -> bytes:
        """Generate a PDF based on the document type and matched transaction data."""
        doc_type = doc_data.get("document_type", "")
        generators = {
            "utility_bill": self._generate_utility_bill,
            "invoice": self._generate_invoice,
            "receipt": self._generate_receipt,
            "payout_statement": self._generate_payout_statement,
            "rent_receipt": self._generate_rent_receipt,
            "mortgage_statement": self._generate_mortgage_statement,
            "insurance_statement": self._generate_insurance_statement,
        }
        generator = generators.get(doc_type, self._generate_generic_invoice)
        return generator(doc_data, matched_transactions)

    def _generate_utility_bill(self, doc_data: dict, txns: list[dict]) -> bytes:
        """Generate a realistic utility company bill."""
        if not txns:
            return self._generate_generic_invoice(doc_data, txns)

        txn = txns[0]
        vendor = txn["vendor"]
        amount = txn["amount"]
        date_str = txn["date"]
        description = txn["description"]
        property_address = txn.get("property_address", "")
        sub_category = txn.get("sub_category", "electricity")

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # Company colors by vendor
        brand_colors = {
            "SoCal Edison": (0.96, 0.58, 0.11),
            "LADWP": (0.0, 0.40, 0.73),
            "SoCalGas": (0.0, 0.53, 0.36),
            "Spectrum": (0.0, 0.36, 0.69),
            "Austin Energy": (0.18, 0.55, 0.24),
            "Austin Water": (0.14, 0.44, 0.68),
            "Texas Gas Service": (0.78, 0.18, 0.18),
            "AT&T": (0.0, 0.60, 0.87),
            "Nashville Electric": (0.92, 0.62, 0.0),
            "Metro Water Nashville": (0.22, 0.47, 0.70),
            "Piedmont Natural Gas": (0.22, 0.34, 0.56),
            "Xfinity": (0.86, 0.15, 0.22),
        }
        brand = brand_colors.get(vendor, (0.2, 0.2, 0.6))

        # Header
        c.setFillColor(colors.Color(*brand))
        c.rect(0, h - 80, w, 80, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 22)
        c.drawString(50, h - 38, vendor.upper())
        c.setFont("Helvetica", 10)

        unit_label = {
            "electricity": "Electric Service",
            "water": "Water Service",
            "gas": "Natural Gas Service",
            "internet": "Internet Service",
        }.get(sub_category, "Utility Service")
        c.drawString(50, h - 56, unit_label)
        c.setFont("Helvetica-Bold", 12)
        c.drawRightString(w - 50, h - 38, "MONTHLY STATEMENT")

        # Account info section
        y = h - 108
        c.setFillColor(colors.Color(0.96, 0.96, 0.96))
        c.rect(40, y - 65, w - 80, 65, fill=1, stroke=0)
        c.setStrokeColor(colors.Color(0.85, 0.85, 0.85))
        c.rect(40, y - 65, w - 80, 65, fill=0, stroke=1)
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(55, y - 15, "ACCOUNT NUMBER")
        c.drawString(200, y - 15, "SERVICE ADDRESS")
        c.drawString(430, y - 15, "BILLING DATE")
        c.setFont("Courier", 10)
        c.drawString(55, y - 32, make_account_number(vendor))
        c.setFont("Helvetica", 10)
        c.drawString(200, y - 32, property_address)
        c.drawString(430, y - 32, date_str)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(55, y - 50, "BILLING PERIOD")
        c.setFont("Helvetica", 10)
        month_name = month_name_from_date(date_str)
        c.drawString(55, y - 62, f"{month_name} 2025")

        # Amount due box
        y = y - 95
        c.setFillColor(colors.Color(*brand))
        c.rect(380, y - 55, w - 420, 55, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(395, y - 18, "AMOUNT DUE")
        c.setFont("Helvetica-Bold", 24)
        c.drawString(395, y - 46, f"${amount}")

        # Usage details
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y - 15, "Service Details")
        y -= 40

        usage_info = get_usage_info(sub_category, float(amount.replace(",", "")))
        rows = [("Description", "Details", "Amount")]
        for row in usage_info:
            rows.append(row)
        rows.append(("", "", ""))
        rows.append(("Total Amount Due", "", f"${amount}"))

        draw_table(c, 50, y, rows, col_widths=[200, 160, 130])

        # Footer
        y -= len(rows) * 20 + 40
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.Color(0.5, 0.5, 0.5))
        c.drawString(50, y, f"Questions? Call {vendor} Customer Service | Payment due within 30 days of billing date")
        c.drawString(50, y - 14, "Late payments subject to a 1.5% monthly finance charge.")

        c.save()
        return buf.getvalue()

    def _generate_invoice(self, doc_data: dict, txns: list[dict]) -> bytes:
        """Generate a professional small-business invoice."""
        if not txns:
            return self._generate_generic_invoice(doc_data, txns)

        txn = txns[0]
        vendor = txn["vendor"]
        amount = txn["amount"]
        date_str = txn["date"]
        description = txn["description"]
        property_address = txn.get("property_address", "")

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # Company header
        c.setFont("Helvetica-Bold", 20)
        c.drawString(50, h - 50, vendor)
        c.setFont("Helvetica", 9)
        c.drawString(50, h - 66, vendor_address(vendor))
        c.drawString(50, h - 78, vendor_contact(vendor))

        # INVOICE label
        c.setFont("Helvetica-Bold", 28)
        c.setFillColor(colors.Color(0.3, 0.3, 0.3))
        c.drawRightString(w - 50, h - 50, "INVOICE")

        # Invoice details
        c.setFillColor(colors.black)
        y = h - 110
        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(w - 150, y, "Invoice Number:")
        c.drawRightString(w - 150, y - 16, "Invoice Date:")
        c.drawRightString(w - 150, y - 32, "Due Date:")
        c.setFont("Courier", 10)
        c.drawString(w - 140, y, make_invoice_number(vendor, date_str))
        c.setFont("Helvetica", 10)
        c.drawString(w - 140, y - 16, date_str)
        c.drawString(w - 140, y - 32, f"Due on receipt")

        # Bill To section
        y = h - 160
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(colors.Color(0.4, 0.4, 0.4))
        c.drawString(50, y, "BILL TO")
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 10)
        c.drawString(50, y - 18, "Demo User")
        c.drawString(50, y - 32, property_address)

        # Line items
        y = y - 65
        c.setFillColor(colors.Color(0.15, 0.15, 0.15))
        c.rect(40, y - 2, w - 80, 20, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(50, y + 3, "DESCRIPTION")
        c.drawString(350, y + 3, "QTY")
        c.drawString(420, y + 3, "RATE")
        c.drawRightString(w - 50, y + 3, "AMOUNT")

        c.setFillColor(colors.black)
        c.setFont("Helvetica", 10)
        y -= 22
        c.drawString(50, y, description)
        c.drawString(350, y, "1")
        c.drawString(420, y, f"${amount}")
        c.drawRightString(w - 50, y, f"${amount}")

        # Total
        y -= 30
        c.setStrokeColor(colors.Color(0.8, 0.8, 0.8))
        c.line(350, y + 10, w - 40, y + 10)
        c.setFont("Helvetica", 10)
        c.drawString(350, y - 5, "Subtotal:")
        c.drawRightString(w - 50, y - 5, f"${amount}")
        c.drawString(350, y - 22, "Tax:")
        c.drawRightString(w - 50, y - 22, "$0.00")
        y -= 38
        c.setFont("Helvetica-Bold", 12)
        c.drawString(350, y, "TOTAL:")
        c.drawRightString(w - 50, y, f"${amount}")

        # Payment terms
        y -= 50
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.Color(0.5, 0.5, 0.5))
        c.drawString(50, y, "Payment Terms: Net 30 | Please include invoice number with payment")
        c.drawString(50, y - 14, f"Thank you for your business! — {vendor}")

        c.save()
        return buf.getvalue()

    def _generate_receipt(self, doc_data: dict, txns: list[dict]) -> bytes:
        """Generate a purchase receipt."""
        if not txns:
            return self._generate_generic_invoice(doc_data, txns)

        txn = txns[0]
        vendor = txn["vendor"]
        amount = txn["amount"]
        date_str = txn["date"]
        description = txn["description"]

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # Store header
        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(w / 2, h - 50, vendor.upper())
        c.setFont("Helvetica", 9)
        c.drawCentredString(w / 2, h - 66, vendor_address(vendor))
        c.drawCentredString(w / 2, h - 78, vendor_contact(vendor))

        # Receipt label
        y = h - 105
        c.setStrokeColor(colors.Color(0.8, 0.8, 0.8))
        c.line(50, y, w - 50, y)
        y -= 20
        c.setFont("Helvetica-Bold", 14)
        c.drawCentredString(w / 2, y, "RECEIPT")
        y -= 25
        c.setFont("Helvetica", 10)
        c.drawString(50, y, f"Date: {date_str}")
        c.drawRightString(w - 50, y, f"Receipt #: {make_invoice_number(vendor, date_str)}")

        # Item
        y -= 35
        c.setFillColor(colors.Color(0.15, 0.15, 0.15))
        c.rect(40, y - 2, w - 80, 20, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(50, y + 3, "ITEM")
        c.drawRightString(w - 50, y + 3, "AMOUNT")

        c.setFillColor(colors.black)
        c.setFont("Helvetica", 10)
        y -= 22
        c.drawString(50, y, description)
        c.drawRightString(w - 50, y, f"${amount}")

        # Total
        y -= 25
        c.line(350, y + 10, w - 40, y + 10)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(350, y - 5, "TOTAL PAID:")
        c.drawRightString(w - 50, y - 5, f"${amount}")

        c.setFont("Helvetica", 9)
        c.drawString(350, y - 22, "Payment Method: Visa ****4821")

        c.save()
        return buf.getvalue()

    def _generate_payout_statement(self, doc_data: dict, txns: list[dict]) -> bytes:
        """Generate an Airbnb-style host payout summary."""
        if not txns:
            return self._generate_generic_invoice(doc_data, txns)

        txn = txns[0]
        amount = txn["amount"]
        date_str = txn["date"]
        description = txn["description"]
        property_name = txn.get("property_name", "Rental Property")

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # Airbnb header
        c.setFillColor(colors.Color(1.0, 0.22, 0.40))  # Airbnb coral
        c.rect(0, h - 75, w, 75, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 24)
        c.drawString(50, h - 40, "airbnb")
        c.setFont("Helvetica", 11)
        c.drawString(50, h - 60, "Host Payout Summary")
        c.setFont("Helvetica-Bold", 11)
        c.drawRightString(w - 50, h - 40, "PAYOUT STATEMENT")

        # Payout details
        y = h - 105
        c.setFillColor(colors.Color(0.97, 0.97, 0.97))
        c.rect(40, y - 70, w - 80, 70, fill=1, stroke=0)
        c.setStrokeColor(colors.Color(0.88, 0.88, 0.88))
        c.rect(40, y - 70, w - 80, 70, fill=0, stroke=1)
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(55, y - 15, "HOST")
        c.drawString(250, y - 15, "LISTING")
        c.drawString(450, y - 15, "PAYOUT DATE")
        c.setFont("Helvetica", 10)
        c.drawString(55, y - 32, "Demo User")
        c.drawString(250, y - 32, property_name)
        c.drawString(450, y - 32, date_str)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(55, y - 50, "PAYOUT PERIOD")
        c.setFont("Helvetica", 10)
        month_name = month_name_from_date(date_str)
        c.drawString(55, y - 65, f"{month_name} 1 - {month_name} 28, 2025")

        # Reservation breakdown
        y = y - 100
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, "Earnings Breakdown")
        y -= 25

        gross = float(amount.replace(",", ""))
        cleaning_fees = round(gross * 0.08, 2)
        service_fee = round(gross * 0.03, 2)
        subtotal = round(gross + cleaning_fees, 2)

        rows = [
            ("Description", "Nights", "Amount"),
            ("Guest reservations", estimate_nights(gross), f"${fmt_num(gross)}"),
            ("Cleaning fees collected", "", f"${fmt_num(cleaning_fees)}"),
            ("Subtotal", "", f"${fmt_num(subtotal)}"),
            ("", "", ""),
            ("Airbnb service fee (3%)", "", f"-${fmt_num(service_fee)}"),
            ("", "", ""),
            ("NET PAYOUT", "", f"${amount}"),
        ]
        draw_table(c, 50, y, rows, col_widths=[250, 100, 150])

        # Payment info
        y -= len(rows) * 20 + 30
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.Color(0.5, 0.5, 0.5))
        c.drawString(50, y, "Payout method: Direct deposit (****4821) | Processed within 1-2 business days")
        c.drawString(50, y - 14, "Questions about this payout? Visit airbnb.com/help or contact Airbnb support.")

        c.save()
        return buf.getvalue()

    def _generate_rent_receipt(self, doc_data: dict, txns: list[dict]) -> bytes:
        """Generate a rent receipt for long-term tenants."""
        if not txns:
            return self._generate_generic_invoice(doc_data, txns)

        txn = txns[0]
        vendor = txn["vendor"]
        amount = txn["amount"]
        date_str = txn["date"]
        property_address = txn.get("property_address", "")

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # Header
        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(w / 2, h - 50, "RENT RECEIPT")
        c.setStrokeColor(colors.Color(0.3, 0.3, 0.3))
        c.line(50, h - 60, w - 50, h - 60)

        # Receipt details
        y = h - 95
        c.setFont("Helvetica", 11)
        c.drawString(50, y, f"Date: {date_str}")
        c.drawString(50, y - 22, f"Receipt Number: RR-{date_str.replace('-', '')}")
        c.drawString(50, y - 44, f"Property: {property_address}")

        y -= 80
        c.setFillColor(colors.Color(0.95, 0.97, 0.95))
        c.rect(40, y - 80, w - 80, 80, fill=1, stroke=0)
        c.setStrokeColor(colors.Color(0.7, 0.85, 0.7))
        c.rect(40, y - 80, w - 80, 80, fill=0, stroke=1)
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(55, y - 20, f"Received from: {vendor}")
        month_name = month_name_from_date(date_str)
        c.drawString(55, y - 42, f"For: {month_name} 2025 rent")
        c.setFont("Helvetica-Bold", 16)
        c.drawString(55, y - 68, f"Amount: ${amount}")

        y -= 110
        c.setFont("Helvetica", 10)
        c.drawString(50, y, "Payment method: Bank transfer")
        c.drawString(50, y - 18, "Status: Received in full")

        # Signature line
        y -= 60
        c.line(50, y, 250, y)
        c.setFont("Helvetica", 9)
        c.drawString(50, y - 14, "Property Owner / Manager Signature")

        c.save()
        return buf.getvalue()

    def _generate_mortgage_statement(self, doc_data: dict, txns: list[dict]) -> bytes:
        """Generate a mortgage payment statement."""
        if not txns:
            return self._generate_generic_invoice(doc_data, txns)

        txn = txns[0]
        vendor = txn["vendor"]
        amount = txn["amount"]
        date_str = txn["date"]
        property_address = txn.get("property_address", "")

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # Bank header
        c.setFillColor(colors.Color(0.08, 0.20, 0.38))
        c.rect(0, h - 80, w, 80, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(50, h - 38, vendor)
        c.setFont("Helvetica", 10)
        c.drawString(50, h - 55, "Mortgage Servicing Department")
        c.setFont("Helvetica-Bold", 11)
        c.drawRightString(w - 50, h - 38, "MONTHLY STATEMENT")

        # Account info
        y = h - 108
        c.setFillColor(colors.Color(0.96, 0.96, 0.96))
        c.rect(40, y - 60, w - 80, 60, fill=1, stroke=0)
        c.setStrokeColor(colors.Color(0.85, 0.85, 0.85))
        c.rect(40, y - 60, w - 80, 60, fill=0, stroke=1)
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(55, y - 15, "BORROWER")
        c.drawString(200, y - 15, "PROPERTY ADDRESS")
        c.drawString(430, y - 15, "STATEMENT DATE")
        c.setFont("Helvetica", 10)
        c.drawString(55, y - 32, "Demo User")
        c.drawString(200, y - 32, property_address)
        c.drawString(430, y - 32, date_str)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(55, y - 48, "LOAN NUMBER")
        c.setFont("Courier", 10)
        c.drawString(55, y - 58, make_loan_number(vendor))

        # Payment breakdown
        y = y - 90
        c.setFont("Helvetica-Bold", 12)
        c.setFillColor(colors.black)
        c.drawString(50, y, "Payment Details")
        y -= 25

        interest = float(amount.replace(",", ""))
        principal = round(interest * 0.45, 2)
        escrow = round(interest * 0.22, 2)
        total_payment = round(interest + principal + escrow, 2)

        rows = [
            ("Component", "Amount"),
            ("Principal", f"${fmt_num(principal)}"),
            ("Interest", f"${amount}"),
            ("Escrow (Tax & Insurance)", f"${fmt_num(escrow)}"),
            ("", ""),
            ("TOTAL MONTHLY PAYMENT", f"${fmt_num(total_payment)}"),
        ]
        draw_table(c, 50, y, rows, col_widths=[350, 150])

        # Loan summary
        y -= len(rows) * 20 + 30
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, "Loan Summary")
        y -= 25

        summary_rows = [
            ("Detail", "Value"),
            ("Original Loan Amount", "$350,000.00"),
            ("Current Principal Balance", "$298,450.00"),
            ("Interest Rate", "5.25% Fixed"),
            ("Maturity Date", "03/2050"),
        ]
        draw_table(c, 50, y, summary_rows, col_widths=[350, 150])

        c.save()
        return buf.getvalue()

    def _generate_insurance_statement(self, doc_data: dict, txns: list[dict]) -> bytes:
        """Generate an insurance premium payment statement."""
        if not txns:
            return self._generate_generic_invoice(doc_data, txns)

        txn = txns[0]
        vendor = txn["vendor"]
        amount = txn["amount"]
        date_str = txn["date"]
        property_address = txn.get("property_address", "")

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        c.setFillColor(colors.Color(0.12, 0.30, 0.52))
        c.rect(0, h - 75, w, 75, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(50, h - 38, vendor)
        c.setFont("Helvetica", 10)
        c.drawString(50, h - 55, "Premium Payment Statement")

        y = h - 100
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(50, y, f"Insured: Demo User")
        c.drawString(50, y - 16, f"Property: {property_address}")
        c.drawString(50, y - 32, f"Statement Date: {date_str}")
        c.drawString(50, y - 48, f"Policy Number: INS-{vendor.replace(' ', '')[:6].upper()}-2025")

        y -= 75
        rows = [
            ("Description", "Amount"),
            (f"Quarterly premium payment", f"${amount}"),
            ("", ""),
            ("Amount Due", f"${amount}"),
        ]
        draw_table(c, 50, y, rows, col_widths=[350, 150])

        c.save()
        return buf.getvalue()

    def _generate_generic_invoice(self, doc_data: dict, txns: list[dict]) -> bytes:
        """Fallback generic invoice."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter
        c.setFont("Helvetica-Bold", 16)
        c.drawString(50, h - 50, "Document")
        c.setFont("Helvetica", 11)
        y = h - 80
        c.drawString(50, y, f"File: {doc_data.get('file_name', 'document.pdf')}")
        for txn in txns:
            y -= 18
            c.drawString(50, y, f"{txn.get('vendor', '')}: ${txn.get('amount', '0.00')}")
        c.save()
        return buf.getvalue()
