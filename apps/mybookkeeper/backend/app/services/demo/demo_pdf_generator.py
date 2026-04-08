"""Generate realistic demo PDFs: IRS forms via reportlab + professional invoices/bills."""

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

_styles = getSampleStyleSheet()
_TITLE_STYLE = ParagraphStyle(
    "DocTitle", parent=_styles["Heading1"], fontSize=16, spaceAfter=6,
)
_NORMAL_STYLE = _styles["Normal"]

# IRS form colors
_IRS_RED = colors.Color(0.72, 0.0, 0.0)


class DemoTaxPdfGenerator:
    """Generates tax document PDFs from structured data dictionaries.

    All forms (1099-K, 1099-MISC, 1098, W-2) are rendered pixel-perfect
    using reportlab, matching IRS form layout. This is more reliable than
    trying to fill IRS fillable PDFs which use XFA forms.
    """

    def generate(self, pdf_data: dict) -> bytes:
        form_type = pdf_data.get("form_type", "")
        generators = {
            "1099-K": self._render_1099k,
            "1099-MISC": self._render_1099misc,
            "1098": self._render_1098,
            "W-2": self._render_w2,
            "Property Tax Statement": self._generate_property_tax,
            "Insurance Declaration": self._generate_insurance,
        }
        generator = generators.get(form_type, self._generate_generic)
        return generator(pdf_data)

    # ------------------------------------------------------------------
    # IRS form renderers — pixel-perfect reportlab reproductions
    # ------------------------------------------------------------------

    def _render_1099k(self, data: dict) -> bytes:
        """Render IRS Form 1099-K (Copy B) with data filled in."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # Form header
        _draw_irs_header(c, w, h, "1099-K", data["tax_year"],
                         "Payment Card and Third Party\nNetwork Transactions",
                         copy_label="Copy B\nFor Payee")

        # Left column — payer/filer info
        left_x = 36
        right_x = 306
        col_w = 264

        y = h - 130
        _draw_labeled_box(c, left_x, y, col_w, 60,
                          "FILER'S name, street address, city or town, state or province, "
                          "country, ZIP or foreign postal code, and telephone no.",
                          f"{data['issuer_name']}\n{data['issuer_address']}")

        y -= 35
        _draw_labeled_box(c, left_x, y, col_w * 0.48, 30,
                          "FILER'S TIN", data["issuer_tin"])
        _draw_labeled_box(c, left_x + col_w * 0.52, y, col_w * 0.48, 30,
                          "PAYEE'S TIN", data["recipient_tin"])

        y -= 60
        _draw_labeled_box(c, left_x, y, col_w, 50,
                          "PAYEE'S name",
                          f"{data['recipient_name']}\n"
                          f"{_split_address_street(data['recipient_address'])}\n"
                          f"{_split_address_city(data['recipient_address'])}")

        # Right column — amounts
        box_h = 28
        amt_y = h - 130
        amt_w = col_w

        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "1a", "Gross amount of payment card/third party network transactions",
                         f"$ {data['gross_amount']}")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "1b", "Card not present transactions",
                         "$ 0.00")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "2", "Merchant category code",
                         "4812")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "3", "Number of payment transactions",
                         data.get("num_transactions", "52"))
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "4", "Federal income tax withheld",
                         f"$ {data.get('fed_tax_withheld', '0.00')}")
        amt_y -= box_h + 2
        # Monthly breakdown boxes (5a-5l)
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "5a-5l", "Gross amount by month (see instructions)",
                         "See attached")

        # Footer
        _draw_irs_footer(c, w, "Form 1099-K", data["tax_year"],
                         "Department of the Treasury - Internal Revenue Service")

        c.save()
        return buf.getvalue()

    def _render_1099misc(self, data: dict) -> bytes:
        """Render IRS Form 1099-MISC (Copy B) with data filled in."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        _draw_irs_header(c, w, h, "1099-MISC", data["tax_year"],
                         "Miscellaneous\nInformation",
                         copy_label="Copy B\nFor Recipient")

        left_x = 36
        right_x = 306
        col_w = 264

        y = h - 130
        _draw_labeled_box(c, left_x, y, col_w, 60,
                          "PAYER'S name, street address, city or town, state or province, "
                          "country, ZIP or foreign postal code, and telephone no.",
                          f"{data['issuer_name']}\n{data['issuer_address']}")

        y -= 35
        _draw_labeled_box(c, left_x, y, col_w * 0.48, 30,
                          "PAYER'S TIN", data["issuer_tin"])
        _draw_labeled_box(c, left_x + col_w * 0.52, y, col_w * 0.48, 30,
                          "RECIPIENT'S TIN", data["recipient_tin"])

        y -= 60
        _draw_labeled_box(c, left_x, y, col_w, 50,
                          "RECIPIENT'S name",
                          f"{data['recipient_name']}\n"
                          f"{_split_address_street(data.get('recipient_address', ''))}\n"
                          f"{_split_address_city(data.get('recipient_address', ''))}")

        # Right column — amount boxes
        box_h = 28
        amt_y = h - 130
        amt_w = col_w

        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "1", "Rents",
                         f"$ {data['rents_amount']}")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "2", "Royalties",
                         "$ 0.00")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "3", "Other income",
                         "$ 0.00")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "4", "Federal income tax withheld",
                         "$ 0.00")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "5", "Fishing boat proceeds",
                         "$ 0.00")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "6", "Medical and health care payments",
                         "$ 0.00")

        _draw_irs_footer(c, w, "Form 1099-MISC", data["tax_year"],
                         "Department of the Treasury - Internal Revenue Service")

        c.save()
        return buf.getvalue()

    def _render_1098(self, data: dict) -> bytes:
        """Render IRS Form 1098 (Copy B) with data filled in."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        _draw_irs_header(c, w, h, "1098", data["tax_year"],
                         "Mortgage\nInterest Statement",
                         copy_label="Copy B\nFor Payer/Borrower")

        left_x = 36
        right_x = 306
        col_w = 264

        y = h - 130
        _draw_labeled_box(c, left_x, y, col_w, 60,
                          "RECIPIENT'S/LENDER'S name, street address, city or town, "
                          "state or province, country, ZIP or foreign postal code, and telephone no.",
                          f"{data['lender_name']}\n{data['lender_address']}")

        y -= 35
        _draw_labeled_box(c, left_x, y, col_w * 0.48, 30,
                          "RECIPIENT'S/LENDER'S TIN", data["lender_tin"])
        _draw_labeled_box(c, left_x + col_w * 0.52, y, col_w * 0.48, 30,
                          "PAYER'S/BORROWER'S TIN", data["borrower_tin"])

        y -= 60
        _draw_labeled_box(c, left_x, y, col_w, 50,
                          "PAYER'S/BORROWER'S name",
                          f"{data['borrower_name']}\n"
                          f"{_split_address_street(data.get('borrower_address', ''))}\n"
                          f"{_split_address_city(data.get('borrower_address', ''))}")

        # Right column — amount boxes
        box_h = 28
        amt_y = h - 130
        amt_w = col_w

        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "1", "Mortgage interest received from payer(s)/borrower(s)",
                         f"$ {data['mortgage_interest']}")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "2", "Outstanding mortgage principal",
                         f"$ {data.get('outstanding_principal', '298,450.00')}")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "3", "Mortgage origination date",
                         data.get("origination_date", "03/15/2020"))
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "4", "Refund of overpaid interest",
                         "$ 0.00")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "5", "Mortgage insurance premiums",
                         "$ 0.00")
        amt_y -= box_h + 2
        _draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                         "6", "Points paid on purchase of principal residence",
                         "$ 0.00")

        _draw_irs_footer(c, w, "Form 1098", data["tax_year"],
                         "Department of the Treasury - Internal Revenue Service")

        c.save()
        return buf.getvalue()

    def _render_w2(self, data: dict) -> bytes:
        """Render IRS Form W-2 (Copy B) with data filled in."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # W-2 header
        c.setFont("Helvetica-Bold", 14)
        c.setFillColor(_IRS_RED)
        c.drawString(36, h - 36, "Form W-2")
        c.setFont("Helvetica", 8)
        c.drawString(36, h - 48, "Wage and Tax Statement")
        c.setFont("Helvetica-Bold", 10)
        c.drawRightString(w - 36, h - 36, f"Copy B — To Be Filed With Employee's FEDERAL Tax Return")
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.black)
        c.drawRightString(w - 36, h - 48, f"Department of the Treasury — Internal Revenue Service")
        c.drawRightString(w - 36, h - 58, data["tax_year"])

        # W-2 layout: grid of labeled boxes
        margin = 36
        form_w = w - 2 * margin
        top_y = h - 72

        # Row 1: Employee's SSN | Employer ID (EIN)
        row_h = 38
        half_w = form_w / 2
        _draw_w2_box(c, margin, top_y, half_w, row_h,
                     "a  Employee's social security number",
                     data.get("employee_ssn", "***-**-1234"))
        _draw_w2_box(c, margin + half_w, top_y, half_w, row_h,
                     "b  Employer identification number (EIN)",
                     data["employer_ein"])

        # Row 2: Employer name/address | Wages & Federal tax
        y = top_y - row_h
        emp_h = 70
        box_w = form_w * 0.55
        amt_col_w = form_w * 0.45

        _draw_w2_box(c, margin, y, box_w, emp_h,
                     "c  Employer's name, address, and ZIP code",
                     f"{data['employer_name']}\n{data['employer_address']}")

        # Boxes 1 and 2 side by side
        half_amt = amt_col_w / 2
        _draw_w2_box(c, margin + box_w, y, half_amt, emp_h / 2,
                     "1  Wages, tips, other compensation",
                     f"$ {data['wages']}")
        _draw_w2_box(c, margin + box_w + half_amt, y, half_amt, emp_h / 2,
                     "2  Federal income tax withheld",
                     f"$ {data['federal_tax_withheld']}")

        # Boxes 3 and 4
        _draw_w2_box(c, margin + box_w, y - emp_h / 2, half_amt, emp_h / 2,
                     "3  Social security wages",
                     f"$ {data['ss_wages']}")
        _draw_w2_box(c, margin + box_w + half_amt, y - emp_h / 2, half_amt, emp_h / 2,
                     "4  Social security tax withheld",
                     f"$ {data['ss_tax']}")

        # Row 3: Control number | Boxes 5 and 6
        y -= emp_h
        row3_h = 38
        _draw_w2_box(c, margin, y, box_w, row3_h,
                     "d  Control number",
                     data.get("control_number", ""))

        _draw_w2_box(c, margin + box_w, y, half_amt, row3_h,
                     "5  Medicare wages and tips",
                     f"$ {data['medicare_wages']}")
        _draw_w2_box(c, margin + box_w + half_amt, y, half_amt, row3_h,
                     "6  Medicare tax withheld",
                     f"$ {data['medicare_tax']}")

        # Row 4: Employee name/address | Boxes 7 and 8
        y -= row3_h
        emp_name_h = 60
        _draw_w2_box(c, margin, y, box_w, emp_name_h,
                     "e/f  Employee's name, address, and ZIP code",
                     f"{data['employee_name']}\n{data.get('employee_address', '')}")

        _draw_w2_box(c, margin + box_w, y, half_amt, emp_name_h / 2,
                     "7  Social security tips",
                     "$ 0.00")
        _draw_w2_box(c, margin + box_w + half_amt, y, half_amt, emp_name_h / 2,
                     "8  Allocated tips",
                     "$ 0.00")

        _draw_w2_box(c, margin + box_w, y - emp_name_h / 2, half_amt, emp_name_h / 2,
                     "9  (blank)",
                     "")
        _draw_w2_box(c, margin + box_w + half_amt, y - emp_name_h / 2, half_amt, emp_name_h / 2,
                     "10  Dependent care benefits",
                     "$ 0.00")

        # Row 5: Boxes 11-14
        y -= emp_name_h
        row5_h = 34
        quarter_w = form_w / 4
        _draw_w2_box(c, margin, y, quarter_w, row5_h,
                     "11  Nonqualified plans", "")
        _draw_w2_box(c, margin + quarter_w, y, quarter_w, row5_h,
                     "12a  See instructions for box 12", data.get("box_12a", "DD  4,200.00"))
        _draw_w2_box(c, margin + 2 * quarter_w, y, quarter_w, row5_h,
                     "13  Statutory employee / Retirement / Third-party sick pay", "")
        _draw_w2_box(c, margin + 3 * quarter_w, y, quarter_w, row5_h,
                     "14  Other", "")

        # Row 6: State/local info (Boxes 15-20)
        y -= row5_h
        row6_h = 34
        state = data.get("state", "TX")
        state_wages = data.get("state_wages", "")
        state_tax = data.get("state_tax", "")
        sixth_w = form_w / 6

        _draw_w2_box(c, margin, y, sixth_w, row6_h,
                     "15  State", state)
        _draw_w2_box(c, margin + sixth_w, y, sixth_w, row6_h,
                     "Employer's state ID no.", data.get("employer_state_id", ""))
        _draw_w2_box(c, margin + 2 * sixth_w, y, sixth_w, row6_h,
                     "16  State wages, tips, etc.",
                     f"$ {state_wages}" if state_wages else "")
        _draw_w2_box(c, margin + 3 * sixth_w, y, sixth_w, row6_h,
                     "17  State income tax",
                     f"$ {state_tax}" if state_tax else "")
        _draw_w2_box(c, margin + 4 * sixth_w, y, sixth_w, row6_h,
                     "18  Local wages, tips, etc.", "")
        _draw_w2_box(c, margin + 5 * sixth_w, y, sixth_w, row6_h,
                     "19  Local income tax", "")

        # IRS footer
        _draw_irs_footer(c, w, "Form W-2", data["tax_year"],
                         "Department of the Treasury - Internal Revenue Service")

        c.save()
        return buf.getvalue()

    # ------------------------------------------------------------------
    # Reportlab generators — professional-looking non-IRS documents
    # ------------------------------------------------------------------

    def _build_pdf(self, elements: list) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=letter,
            leftMargin=0.75 * inch, rightMargin=0.75 * inch,
            topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        )
        doc.build(elements)
        return buf.getvalue()

    def _generate_property_tax(self, data: dict) -> bytes:
        """Generate a realistic county property tax statement."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # Header bar
        c.setFillColor(colors.Color(0.12, 0.24, 0.42))
        c.rect(0, h - 90, w, 90, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(50, h - 40, data["authority_name"])
        c.setFont("Helvetica", 10)
        c.drawString(50, h - 58, data["authority_address"])
        c.drawString(50, h - 72, f"Tax Year {data['tax_year']} — Property Tax Statement")

        # Statement info box
        y = h - 120
        c.setFillColor(colors.Color(0.95, 0.95, 0.95))
        c.rect(40, y - 80, w - 80, 80, fill=1, stroke=0)
        c.setStrokeColor(colors.Color(0.8, 0.8, 0.8))
        c.rect(40, y - 80, w - 80, 80, fill=0, stroke=1)
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(55, y - 18, "Property Owner:")
        c.drawString(55, y - 36, "Property Address:")
        c.drawString(55, y - 54, "Account Number:")
        c.drawString(55, y - 72, "Tax Year:")
        c.setFont("Helvetica", 11)
        c.drawString(200, y - 18, data["owner_name"])
        c.drawString(200, y - 36, data["property_address"])
        c.drawString(200, y - 54, data.get("account_number", "2025-PTX-004821"))
        c.drawString(200, y - 72, str(data["tax_year"]))

        # Tax assessment table
        y = y - 110
        c.setFont("Helvetica-Bold", 13)
        c.drawString(50, y, "Tax Assessment")
        y -= 25

        rows = [
            ("Description", "Amount"),
            ("Assessed Land Value", f"${_fmt_num(float(data['assessed_value'].replace(',', '')) * 0.4)}"),
            ("Assessed Improvement Value", f"${_fmt_num(float(data['assessed_value'].replace(',', '')) * 0.6)}"),
            ("Total Assessed Value", f"${data['assessed_value']}"),
            ("", ""),
            ("Homestead Exemption", "$0.00"),
            ("Net Taxable Value", f"${data['assessed_value']}"),
        ]
        _draw_table(c, 50, y, rows, col_widths=[350, 150])

        # Tax breakdown
        y -= len(rows) * 20 + 30
        c.setFont("Helvetica-Bold", 13)
        c.drawString(50, y, "Tax Breakdown")
        y -= 25

        tax_amount = float(data["tax_amount"].replace(",", ""))
        county_rate = round(tax_amount * 0.55, 2)
        school_rate = round(tax_amount * 0.35, 2)
        special_rate = round(tax_amount - county_rate - school_rate, 2)
        tax_rows = [
            ("Taxing Authority", "Rate", "Amount"),
            ("County General Fund", "0.4832%", f"${_fmt_num(county_rate)}"),
            ("School District", "0.3218%", f"${_fmt_num(school_rate)}"),
            ("Special Districts", "0.0950%", f"${_fmt_num(special_rate)}"),
            ("", "", ""),
            ("TOTAL TAX DUE", "", f"${data['tax_amount']}"),
        ]
        _draw_table(c, 50, y, tax_rows, col_widths=[250, 100, 150])

        # Payment notice
        y -= len(tax_rows) * 20 + 30
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(colors.Color(0.6, 0.1, 0.1))
        c.drawString(50, y, "PAYMENT DUE: January 31st. Late payments subject to penalty and interest.")
        c.setFillColor(colors.black)

        c.save()
        return buf.getvalue()

    def _generate_insurance(self, data: dict) -> bytes:
        """Generate a realistic insurance declarations page."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # Company header
        c.setFillColor(colors.Color(0.0, 0.33, 0.62))
        c.rect(0, h - 80, w, 80, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(50, h - 35, data["insurer_name"])
        c.setFont("Helvetica", 10)
        c.drawString(50, h - 52, data["insurer_address"])
        c.drawString(50, h - 66, "Declarations Page")

        # Policy info
        y = h - 110
        c.setFillColor(colors.Color(0.95, 0.97, 1.0))
        c.rect(40, y - 90, w - 80, 90, fill=1, stroke=0)
        c.setStrokeColor(colors.Color(0.7, 0.8, 0.9))
        c.rect(40, y - 90, w - 80, 90, fill=0, stroke=1)
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(55, y - 15, "Policy Number:")
        c.drawString(55, y - 33, "Named Insured:")
        c.drawString(55, y - 51, "Property Address:")
        c.drawString(55, y - 69, "Coverage Period:")
        c.drawString(55, y - 87, "Policy Type:")
        c.setFont("Helvetica", 10)
        c.drawString(200, y - 15, data["policy_number"])
        c.drawString(200, y - 33, data["insured_name"])
        c.drawString(200, y - 51, data["property_address"])
        c.drawString(200, y - 69, data["coverage_period"])
        c.drawString(200, y - 87, "Homeowners — HO-3 Special Form")

        # Coverage table
        y = y - 120
        c.setFont("Helvetica-Bold", 13)
        c.drawString(50, y, "Coverage Summary")
        y -= 25

        rows = [
            ("Coverage", "Limit", "Deductible"),
            ("Dwelling (Coverage A)", f"${data['dwelling_coverage']}", "$1,000"),
            ("Other Structures (Coverage B)", "$45,000.00", "$1,000"),
            ("Personal Property (Coverage C)", "$225,000.00", "$1,000"),
            ("Loss of Use (Coverage D)", "$90,000.00", "N/A"),
            ("Personal Liability", "$300,000.00", "N/A"),
            ("Medical Payments", "$5,000.00", "N/A"),
        ]
        _draw_table(c, 50, y, rows, col_widths=[220, 140, 140])

        # Premium summary
        y -= len(rows) * 20 + 30
        c.setFont("Helvetica-Bold", 13)
        c.drawString(50, y, "Premium Summary")
        y -= 25

        premium_rows = [
            ("Component", "Amount"),
            ("Base Premium", f"${_fmt_num(float(data['annual_premium'].replace(',', '')) * 0.7)}"),
            ("Wind/Hail Coverage", f"${_fmt_num(float(data['annual_premium'].replace(',', '')) * 0.2)}"),
            ("Liability Coverage", f"${_fmt_num(float(data['annual_premium'].replace(',', '')) * 0.1)}"),
            ("", ""),
            ("TOTAL ANNUAL PREMIUM", f"${data['annual_premium']}"),
        ]
        _draw_table(c, 50, y, premium_rows, col_widths=[350, 150])

        c.save()
        return buf.getvalue()

    def _generate_generic(self, data: dict) -> bytes:
        elements = [
            Paragraph(data.get("form_type", "Tax Document"), _TITLE_STYLE),
            Spacer(1, 12),
        ]
        for key, value in data.items():
            if key != "form_type":
                elements.append(Paragraph(f"<b>{key}:</b> {value}", _NORMAL_STYLE))
        return self._build_pdf(elements)


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
        c.drawString(55, y - 32, _make_account_number(vendor))
        c.setFont("Helvetica", 10)
        c.drawString(200, y - 32, property_address)
        c.drawString(430, y - 32, date_str)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(55, y - 50, "BILLING PERIOD")
        c.setFont("Helvetica", 10)
        month_name = _month_name_from_date(date_str)
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

        usage_info = _get_usage_info(sub_category, float(amount.replace(",", "")))
        rows = [("Description", "Details", "Amount")]
        for row in usage_info:
            rows.append(row)
        rows.append(("", "", ""))
        rows.append(("Total Amount Due", "", f"${amount}"))

        _draw_table(c, 50, y, rows, col_widths=[200, 160, 130])

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
        c.drawString(50, h - 66, _vendor_address(vendor))
        c.drawString(50, h - 78, _vendor_contact(vendor))

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
        c.drawString(w - 140, y, _make_invoice_number(vendor, date_str))
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
        c.drawCentredString(w / 2, h - 66, _vendor_address(vendor))
        c.drawCentredString(w / 2, h - 78, _vendor_contact(vendor))

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
        c.drawRightString(w - 50, y, f"Receipt #: {_make_invoice_number(vendor, date_str)}")

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
        month_name = _month_name_from_date(date_str)
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
            ("Guest reservations", _estimate_nights(gross), f"${_fmt_num(gross)}"),
            ("Cleaning fees collected", "", f"${_fmt_num(cleaning_fees)}"),
            ("Subtotal", "", f"${_fmt_num(subtotal)}"),
            ("", "", ""),
            ("Airbnb service fee (3%)", "", f"-${_fmt_num(service_fee)}"),
            ("", "", ""),
            ("NET PAYOUT", "", f"${amount}"),
        ]
        _draw_table(c, 50, y, rows, col_widths=[250, 100, 150])

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
        month_name = _month_name_from_date(date_str)
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
        c.drawString(55, y - 58, _make_loan_number(vendor))

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
            ("Principal", f"${_fmt_num(principal)}"),
            ("Interest", f"${amount}"),
            ("Escrow (Tax & Insurance)", f"${_fmt_num(escrow)}"),
            ("", ""),
            ("TOTAL MONTHLY PAYMENT", f"${_fmt_num(total_payment)}"),
        ]
        _draw_table(c, 50, y, rows, col_widths=[350, 150])

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
        _draw_table(c, 50, y, summary_rows, col_widths=[350, 150])

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
        _draw_table(c, 50, y, rows, col_widths=[350, 150])

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


# ------------------------------------------------------------------
# IRS form rendering helpers
# ------------------------------------------------------------------

def _draw_irs_header(
    c: canvas.Canvas, w: float, h: float,
    form_number: str, tax_year: str, title: str, copy_label: str,
) -> None:
    """Draw the standard IRS form header with red form number and title."""
    # Red line across top
    c.setStrokeColor(_IRS_RED)
    c.setLineWidth(2)
    c.line(36, h - 18, w - 36, h - 18)

    # Form number (red, top-left)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(_IRS_RED)
    c.drawString(36, h - 32, f"Form {form_number}")

    # Tax year
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(_IRS_RED)
    c.drawCentredString(w / 2 - 40, h - 36, tax_year)

    # Title (centered)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.black)
    lines = title.split("\n")
    for i, line in enumerate(lines):
        c.drawCentredString(w / 2 + 20, h - 50 - i * 12, line)

    # Copy label (top-right)
    c.setFont("Helvetica", 8)
    c.setFillColor(_IRS_RED)
    copy_lines = copy_label.split("\n")
    for i, line in enumerate(copy_lines):
        c.drawRightString(w - 36, h - 32 - i * 10, line)

    # IRS header line
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.5)
    c.line(36, h - 70, w - 36, h - 70)

    # Reset colors
    c.setFillColor(colors.black)
    c.setStrokeColor(colors.black)


def _draw_irs_footer(
    c: canvas.Canvas, w: float, form_name: str, tax_year: str, dept: str,
) -> None:
    """Draw the standard IRS form footer."""
    c.setStrokeColor(_IRS_RED)
    c.setLineWidth(1)
    c.line(36, 50, w - 36, 50)

    c.setFont("Helvetica", 7)
    c.setFillColor(colors.Color(0.4, 0.4, 0.4))
    c.drawString(36, 38, f"{form_name} (Rev. 1-{tax_year})")
    c.drawRightString(w - 36, 38, dept)


def _draw_labeled_box(
    c: canvas.Canvas, x: float, y: float, w: float, h: float,
    label: str, value: str,
) -> None:
    """Draw a box with a small label at top and data value below it."""
    c.setStrokeColor(colors.Color(0.6, 0.6, 0.6))
    c.setLineWidth(0.5)
    c.rect(x, y - h, w, h, fill=0, stroke=1)

    # Label (small, gray)
    c.setFont("Helvetica", 5.5)
    c.setFillColor(colors.Color(0.3, 0.3, 0.3))
    # Truncate label to fit
    max_chars = int(w / 3.2)
    display_label = label[:max_chars] + "..." if len(label) > max_chars else label
    c.drawString(x + 3, y - 9, display_label)

    # Value (Courier, larger)
    c.setFont("Courier", 9)
    c.setFillColor(colors.black)
    lines = value.split("\n")
    for i, line in enumerate(lines):
        c.drawString(x + 5, y - 20 - i * 11, line)


def _draw_amount_box(
    c: canvas.Canvas, x: float, y: float, w: float, h: float,
    box_num: str, label: str, value: str,
) -> None:
    """Draw a numbered amount box with label and value."""
    c.setStrokeColor(colors.Color(0.6, 0.6, 0.6))
    c.setLineWidth(0.5)
    c.rect(x, y - h, w, h, fill=0, stroke=1)

    # Box number (bold)
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(colors.black)
    c.drawString(x + 2, y - 9, box_num)

    # Label (small, truncated)
    c.setFont("Helvetica", 5)
    c.setFillColor(colors.Color(0.3, 0.3, 0.3))
    max_chars = int((w - 25) / 2.8)
    display_label = label[:max_chars] + "..." if len(label) > max_chars else label
    c.drawString(x + 18, y - 9, display_label)

    # Value (Courier, right-aligned)
    c.setFont("Courier-Bold", 10)
    c.setFillColor(colors.black)
    c.drawRightString(x + w - 5, y - h + 6, value)


def _draw_w2_box(
    c: canvas.Canvas, x: float, y: float, w: float, h: float,
    label: str, value: str,
) -> None:
    """Draw a W-2 form box with label and value."""
    c.setStrokeColor(colors.Color(0.6, 0.6, 0.6))
    c.setLineWidth(0.5)
    c.rect(x, y - h, w, h, fill=0, stroke=1)

    # Label (small, at top)
    c.setFont("Helvetica", 5.5)
    c.setFillColor(colors.Color(0.3, 0.3, 0.3))
    max_chars = int(w / 3.2)
    display_label = label[:max_chars] + "..." if len(label) > max_chars else label
    c.drawString(x + 2, y - 8, display_label)

    # Value
    c.setFont("Courier-Bold", 9)
    c.setFillColor(colors.black)
    lines = value.split("\n") if value else [""]
    for i, line in enumerate(lines):
        c.drawString(x + 4, y - 18 - i * 10, line)


# ------------------------------------------------------------------
# Helper functions
# ------------------------------------------------------------------

def _split_address_street(address: str) -> str:
    """Get the street portion of a comma-separated address."""
    parts = address.split(",")
    return parts[0].strip() if parts else address


def _split_address_city(address: str) -> str:
    """Get the city/state/zip portion of a comma-separated address."""
    parts = address.split(",", 1)
    return parts[1].strip() if len(parts) > 1 else ""


def _fmt_num(val: float) -> str:
    """Format a number with commas and 2 decimal places."""
    return f"{val:,.2f}"


def _month_name_from_date(date_str: str) -> str:
    """Extract month name from YYYY-MM-DD string."""
    months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]
    month_idx = int(date_str.split("-")[1]) - 1
    return months[month_idx]


def _make_account_number(vendor: str) -> str:
    """Generate a realistic account number from vendor name."""
    seed = sum(ord(c) for c in vendor) % 900000 + 100000
    return f"{seed:06d}-{(seed * 7) % 9000 + 1000}"


def _make_invoice_number(vendor: str, date_str: str) -> str:
    """Generate a deterministic invoice number."""
    seed = sum(ord(c) for c in vendor + date_str)
    prefix = vendor[:3].upper().replace(" ", "")
    return f"INV-{prefix}-{seed % 90000 + 10000}"


def _make_loan_number(vendor: str) -> str:
    """Generate a deterministic loan number."""
    seed = sum(ord(c) for c in vendor) % 9000000 + 1000000
    return f"ML-{seed}"


def _vendor_address(vendor: str) -> str:
    """Return a realistic address for a vendor."""
    addresses = {
        "Ace Plumbing": "4521 Main St, Los Angeles, CA 90012",
        "LA Pool & Spa Service": "8900 Wilshire Blvd, Los Angeles, CA 90048",
        "Pacific Coast Roofing": "1200 Venice Blvd, Los Angeles, CA 90034",
        "HVAC Solutions": "3200 S Congress Ave, Austin, TX 78704",
        "Lone Star Plumbing": "7800 N Lamar Blvd, Austin, TX 78752",
        "Austin Appliance Repair": "2100 E Cesar Chavez, Austin, TX 78702",
        "Nashville Handyman Services": "1500 Broadway, Nashville, TN 37203",
        "Music City Electric": "900 2nd Ave S, Nashville, TN 37210",
        "SparkleClean Services": "620 S Spring St, Los Angeles, CA 90014",
        "Music City Cleaners": "410 Broadway, Nashville, TN 37203",
        "Airbnb Service Fee": "888 Brannan St, San Francisco, CA 94103",
        "Martinez Painting Co": "3300 Sunset Blvd, Los Angeles, CA 90026",
        "Green Thumb Landscaping": "5600 Burnet Rd, Austin, TX 78756",
        "Austin Property Management Co": "200 Congress Ave, Austin, TX 78701",
        "Thompson & Associates CPA": "300 W 6th St, Suite 400, Austin, TX 78701",
        "Harris Law Group": "600 W 28th St, Austin, TX 78705",
        "Pottery Barn": "3333 Bristol St, Costa Mesa, CA 92626",
        "Target": "7100 Santa Monica Blvd, Los Angeles, CA 90046",
        "IKEA": "1 IKEA Way, Nashville, TN 37214",
        "West Elm": "1720 21st Ave S, Nashville, TN 37212",
        "Southwest Airlines": "2702 Love Field Dr, Dallas, TX 75235",
        "Delta Airlines": "1030 Delta Blvd, Atlanta, GA 30354",
        "Shell Gas Station": "I-35 & 290, Austin, TX 78753",
        "Zillow": "1301 2nd Ave, Seattle, WA 98101",
        "Apartments.com": "30700 Russell Ranch Rd, Westlake Village, CA 91362",
        "Home Depot": "2727 W Olympic Blvd, Los Angeles, CA 90006",
        "Lowes": "1 Lowe's Blvd, Mooresville, NC 28117",
    }
    return addresses.get(vendor, f"123 Business Ave, Anytown, USA")


def _vendor_contact(vendor: str) -> str:
    """Return a realistic phone/email for a vendor."""
    seed = sum(ord(c) for c in vendor) % 900 + 100
    area = {
        "Los Angeles": "213", "Austin": "512", "Nashville": "615",
        "San Francisco": "415", "Dallas": "214", "Atlanta": "404",
    }
    city = "Los Angeles"
    for city_name, code in area.items():
        if city_name.lower() in _vendor_address(vendor).lower():
            return f"({code}) 555-{seed:04d} | info@{vendor.lower().replace(' ', '').replace('&', '')[:12]}.com"
    return f"(800) 555-{seed:04d} | info@{vendor.lower().replace(' ', '').replace('&', '')[:12]}.com"


def _get_usage_info(sub_category: str, amount: float) -> list[tuple[str, str, str]]:
    """Generate realistic usage details for utility bills."""
    if sub_category == "electricity":
        kwh = int(amount / 0.18)
        return [
            ("Electricity usage", f"{kwh} kWh @ $0.18/kWh", f"${_fmt_num(kwh * 0.18)}"),
            ("Distribution charge", "", f"${_fmt_num(amount * 0.12)}"),
            ("Taxes & fees", "", f"${_fmt_num(amount - kwh * 0.18 - amount * 0.12)}"),
        ]
    elif sub_category == "water":
        gallons = int(amount / 0.008)
        return [
            ("Water usage", f"{gallons:,} gal @ $0.008/gal", f"${_fmt_num(gallons * 0.008)}"),
            ("Sewer service", "", f"${_fmt_num(amount * 0.3)}"),
            ("Base charge", "", f"${_fmt_num(amount - gallons * 0.008 - amount * 0.3)}"),
        ]
    elif sub_category == "gas":
        therms = int(amount / 1.2)
        return [
            ("Natural gas usage", f"{therms} therms @ $1.20/therm", f"${_fmt_num(therms * 1.2)}"),
            ("Delivery charge", "", f"${_fmt_num(amount * 0.15)}"),
            ("Taxes & fees", "", f"${_fmt_num(amount - therms * 1.2 - amount * 0.15)}"),
        ]
    else:  # internet
        return [
            ("Internet service — 500 Mbps plan", "", f"${_fmt_num(amount * 0.85)}"),
            ("Equipment rental (modem/router)", "", f"${_fmt_num(amount * 0.10)}"),
            ("Taxes & surcharges", "", f"${_fmt_num(amount * 0.05)}"),
        ]


def _estimate_nights(gross: float) -> str:
    """Estimate number of guest-nights from gross revenue."""
    avg_nightly = 180
    nights = max(1, int(gross / avg_nightly))
    return str(nights)


def _draw_table(
    c: canvas.Canvas,
    x: float,
    y: float,
    rows: list[tuple],
    col_widths: list[int],
) -> None:
    """Draw a simple table on a canvas at the given position."""
    row_height = 20
    c.saveState()

    for i, row in enumerate(rows):
        row_y = y - i * row_height
        if i == 0:
            # Header row
            c.setFillColor(colors.Color(0.93, 0.93, 0.93))
            total_w = sum(col_widths)
            c.rect(x, row_y - 4, total_w, row_height, fill=1, stroke=0)
            c.setFillColor(colors.black)
            c.setFont("Helvetica-Bold", 9)
        else:
            c.setFont("Helvetica", 9)
            # Bold the last non-empty row (usually totals)
            if row[0] and any(
                r[0] for r in rows[i + 1:]
            ) is False:
                c.setFont("Helvetica-Bold", 10)

        col_x = x
        for j, cell in enumerate(row):
            if j == len(row) - 1 and i > 0:
                # Right-align amounts column
                c.drawRightString(col_x + col_widths[j], row_y, str(cell))
            else:
                c.drawString(col_x + 4, row_y, str(cell))
            col_x += col_widths[j]

    # Draw bottom border
    total_w = sum(col_widths)
    c.setStrokeColor(colors.Color(0.85, 0.85, 0.85))
    c.line(x, y - len(rows) * row_height + 8, x + total_w, y - len(rows) * row_height + 8)

    c.restoreState()
