"""Demo PDF generators for IRS tax forms: W-2, 1099-K, 1099-MISC, 1098, property tax, and insurance declarations."""

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.pdfgen import canvas

from app.services.demo.demo_generators.base import (
    IRS_RED,
    NORMAL_STYLE,
    TITLE_STYLE,
    draw_amount_box,
    draw_irs_footer,
    draw_irs_header,
    draw_labeled_box,
    draw_table,
    draw_w2_box,
    fmt_num,
    split_address_city,
    split_address_street,
)


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

    def _render_1099k(self, data: dict) -> bytes:
        """Render IRS Form 1099-K (Copy B) with data filled in."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        # Form header
        draw_irs_header(c, w, h, "1099-K", data["tax_year"],
                        "Payment Card and Third Party\nNetwork Transactions",
                        copy_label="Copy B\nFor Payee")

        # Left column — payer/filer info
        left_x = 36
        right_x = 306
        col_w = 264

        y = h - 130
        draw_labeled_box(c, left_x, y, col_w, 60,
                         "FILER'S name, street address, city or town, state or province, "
                         "country, ZIP or foreign postal code, and telephone no.",
                         f"{data['issuer_name']}\n{data['issuer_address']}")

        y -= 35
        draw_labeled_box(c, left_x, y, col_w * 0.48, 30,
                         "FILER'S TIN", data["issuer_tin"])
        draw_labeled_box(c, left_x + col_w * 0.52, y, col_w * 0.48, 30,
                         "PAYEE'S TIN", data["recipient_tin"])

        y -= 60
        draw_labeled_box(c, left_x, y, col_w, 50,
                         "PAYEE'S name",
                         f"{data['recipient_name']}\n"
                         f"{split_address_street(data['recipient_address'])}\n"
                         f"{split_address_city(data['recipient_address'])}")

        # Right column — amounts
        box_h = 28
        amt_y = h - 130
        amt_w = col_w

        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "1a", "Gross amount of payment card/third party network transactions",
                        f"$ {data['gross_amount']}")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "1b", "Card not present transactions",
                        "$ 0.00")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "2", "Merchant category code",
                        "4812")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "3", "Number of payment transactions",
                        data.get("num_transactions", "52"))
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "4", "Federal income tax withheld",
                        f"$ {data.get('fed_tax_withheld', '0.00')}")
        amt_y -= box_h + 2
        # Monthly breakdown boxes (5a-5l)
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "5a-5l", "Gross amount by month (see instructions)",
                        "See attached")

        # Footer
        draw_irs_footer(c, w, "Form 1099-K", data["tax_year"],
                        "Department of the Treasury - Internal Revenue Service")

        c.save()
        return buf.getvalue()

    def _render_1099misc(self, data: dict) -> bytes:
        """Render IRS Form 1099-MISC (Copy B) with data filled in."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        draw_irs_header(c, w, h, "1099-MISC", data["tax_year"],
                        "Miscellaneous\nInformation",
                        copy_label="Copy B\nFor Recipient")

        left_x = 36
        right_x = 306
        col_w = 264

        y = h - 130
        draw_labeled_box(c, left_x, y, col_w, 60,
                         "PAYER'S name, street address, city or town, state or province, "
                         "country, ZIP or foreign postal code, and telephone no.",
                         f"{data['issuer_name']}\n{data['issuer_address']}")

        y -= 35
        draw_labeled_box(c, left_x, y, col_w * 0.48, 30,
                         "PAYER'S TIN", data["issuer_tin"])
        draw_labeled_box(c, left_x + col_w * 0.52, y, col_w * 0.48, 30,
                         "RECIPIENT'S TIN", data["recipient_tin"])

        y -= 60
        draw_labeled_box(c, left_x, y, col_w, 50,
                         "RECIPIENT'S name",
                         f"{data['recipient_name']}\n"
                         f"{split_address_street(data.get('recipient_address', ''))}\n"
                         f"{split_address_city(data.get('recipient_address', ''))}")

        # Right column — amount boxes
        box_h = 28
        amt_y = h - 130
        amt_w = col_w

        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "1", "Rents",
                        f"$ {data['rents_amount']}")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "2", "Royalties",
                        "$ 0.00")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "3", "Other income",
                        "$ 0.00")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "4", "Federal income tax withheld",
                        "$ 0.00")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "5", "Fishing boat proceeds",
                        "$ 0.00")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "6", "Medical and health care payments",
                        "$ 0.00")

        draw_irs_footer(c, w, "Form 1099-MISC", data["tax_year"],
                        "Department of the Treasury - Internal Revenue Service")

        c.save()
        return buf.getvalue()

    def _render_1098(self, data: dict) -> bytes:
        """Render IRS Form 1098 (Copy B) with data filled in."""
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        w, h = letter

        draw_irs_header(c, w, h, "1098", data["tax_year"],
                        "Mortgage\nInterest Statement",
                        copy_label="Copy B\nFor Payer/Borrower")

        left_x = 36
        right_x = 306
        col_w = 264

        y = h - 130
        draw_labeled_box(c, left_x, y, col_w, 60,
                         "RECIPIENT'S/LENDER'S name, street address, city or town, "
                         "state or province, country, ZIP or foreign postal code, and telephone no.",
                         f"{data['lender_name']}\n{data['lender_address']}")

        y -= 35
        draw_labeled_box(c, left_x, y, col_w * 0.48, 30,
                         "RECIPIENT'S/LENDER'S TIN", data["lender_tin"])
        draw_labeled_box(c, left_x + col_w * 0.52, y, col_w * 0.48, 30,
                         "PAYER'S/BORROWER'S TIN", data["borrower_tin"])

        y -= 60
        draw_labeled_box(c, left_x, y, col_w, 50,
                         "PAYER'S/BORROWER'S name",
                         f"{data['borrower_name']}\n"
                         f"{split_address_street(data.get('borrower_address', ''))}\n"
                         f"{split_address_city(data.get('borrower_address', ''))}")

        # Right column — amount boxes
        box_h = 28
        amt_y = h - 130
        amt_w = col_w

        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "1", "Mortgage interest received from payer(s)/borrower(s)",
                        f"$ {data['mortgage_interest']}")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "2", "Outstanding mortgage principal",
                        f"$ {data.get('outstanding_principal', '298,450.00')}")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "3", "Mortgage origination date",
                        data.get("origination_date", "03/15/2020"))
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "4", "Refund of overpaid interest",
                        "$ 0.00")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "5", "Mortgage insurance premiums",
                        "$ 0.00")
        amt_y -= box_h + 2
        draw_amount_box(c, right_x, amt_y, amt_w, box_h,
                        "6", "Points paid on purchase of principal residence",
                        "$ 0.00")

        draw_irs_footer(c, w, "Form 1098", data["tax_year"],
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
        c.setFillColor(IRS_RED)
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
        draw_w2_box(c, margin, top_y, half_w, row_h,
                    "a  Employee's social security number",
                    data.get("employee_ssn", "***-**-1234"))
        draw_w2_box(c, margin + half_w, top_y, half_w, row_h,
                    "b  Employer identification number (EIN)",
                    data["employer_ein"])

        # Row 2: Employer name/address | Wages & Federal tax
        y = top_y - row_h
        emp_h = 70
        box_w = form_w * 0.55
        amt_col_w = form_w * 0.45

        draw_w2_box(c, margin, y, box_w, emp_h,
                    "c  Employer's name, address, and ZIP code",
                    f"{data['employer_name']}\n{data['employer_address']}")

        # Boxes 1 and 2 side by side
        half_amt = amt_col_w / 2
        draw_w2_box(c, margin + box_w, y, half_amt, emp_h / 2,
                    "1  Wages, tips, other compensation",
                    f"$ {data['wages']}")
        draw_w2_box(c, margin + box_w + half_amt, y, half_amt, emp_h / 2,
                    "2  Federal income tax withheld",
                    f"$ {data['federal_tax_withheld']}")

        # Boxes 3 and 4
        draw_w2_box(c, margin + box_w, y - emp_h / 2, half_amt, emp_h / 2,
                    "3  Social security wages",
                    f"$ {data['ss_wages']}")
        draw_w2_box(c, margin + box_w + half_amt, y - emp_h / 2, half_amt, emp_h / 2,
                    "4  Social security tax withheld",
                    f"$ {data['ss_tax']}")

        # Row 3: Control number | Boxes 5 and 6
        y -= emp_h
        row3_h = 38
        draw_w2_box(c, margin, y, box_w, row3_h,
                    "d  Control number",
                    data.get("control_number", ""))

        draw_w2_box(c, margin + box_w, y, half_amt, row3_h,
                    "5  Medicare wages and tips",
                    f"$ {data['medicare_wages']}")
        draw_w2_box(c, margin + box_w + half_amt, y, half_amt, row3_h,
                    "6  Medicare tax withheld",
                    f"$ {data['medicare_tax']}")

        # Row 4: Employee name/address | Boxes 7 and 8
        y -= row3_h
        emp_name_h = 60
        draw_w2_box(c, margin, y, box_w, emp_name_h,
                    "e/f  Employee's name, address, and ZIP code",
                    f"{data['employee_name']}\n{data.get('employee_address', '')}")

        draw_w2_box(c, margin + box_w, y, half_amt, emp_name_h / 2,
                    "7  Social security tips",
                    "$ 0.00")
        draw_w2_box(c, margin + box_w + half_amt, y, half_amt, emp_name_h / 2,
                    "8  Allocated tips",
                    "$ 0.00")

        draw_w2_box(c, margin + box_w, y - emp_name_h / 2, half_amt, emp_name_h / 2,
                    "9  (blank)",
                    "")
        draw_w2_box(c, margin + box_w + half_amt, y - emp_name_h / 2, half_amt, emp_name_h / 2,
                    "10  Dependent care benefits",
                    "$ 0.00")

        # Row 5: Boxes 11-14
        y -= emp_name_h
        row5_h = 34
        quarter_w = form_w / 4
        draw_w2_box(c, margin, y, quarter_w, row5_h,
                    "11  Nonqualified plans", "")
        draw_w2_box(c, margin + quarter_w, y, quarter_w, row5_h,
                    "12a  See instructions for box 12", data.get("box_12a", "DD  4,200.00"))
        draw_w2_box(c, margin + 2 * quarter_w, y, quarter_w, row5_h,
                    "13  Statutory employee / Retirement / Third-party sick pay", "")
        draw_w2_box(c, margin + 3 * quarter_w, y, quarter_w, row5_h,
                    "14  Other", "")

        # Row 6: State/local info (Boxes 15-20)
        y -= row5_h
        row6_h = 34
        state = data.get("state", "TX")
        state_wages = data.get("state_wages", "")
        state_tax = data.get("state_tax", "")
        sixth_w = form_w / 6

        draw_w2_box(c, margin, y, sixth_w, row6_h,
                    "15  State", state)
        draw_w2_box(c, margin + sixth_w, y, sixth_w, row6_h,
                    "Employer's state ID no.", data.get("employer_state_id", ""))
        draw_w2_box(c, margin + 2 * sixth_w, y, sixth_w, row6_h,
                    "16  State wages, tips, etc.",
                    f"$ {state_wages}" if state_wages else "")
        draw_w2_box(c, margin + 3 * sixth_w, y, sixth_w, row6_h,
                    "17  State income tax",
                    f"$ {state_tax}" if state_tax else "")
        draw_w2_box(c, margin + 4 * sixth_w, y, sixth_w, row6_h,
                    "18  Local wages, tips, etc.", "")
        draw_w2_box(c, margin + 5 * sixth_w, y, sixth_w, row6_h,
                    "19  Local income tax", "")

        # IRS footer
        draw_irs_footer(c, w, "Form W-2", data["tax_year"],
                        "Department of the Treasury - Internal Revenue Service")

        c.save()
        return buf.getvalue()

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
            ("Assessed Land Value", f"${fmt_num(float(data['assessed_value'].replace(',', '')) * 0.4)}"),
            ("Assessed Improvement Value", f"${fmt_num(float(data['assessed_value'].replace(',', '')) * 0.6)}"),
            ("Total Assessed Value", f"${data['assessed_value']}"),
            ("", ""),
            ("Homestead Exemption", "$0.00"),
            ("Net Taxable Value", f"${data['assessed_value']}"),
        ]
        draw_table(c, 50, y, rows, col_widths=[350, 150])

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
            ("County General Fund", "0.4832%", f"${fmt_num(county_rate)}"),
            ("School District", "0.3218%", f"${fmt_num(school_rate)}"),
            ("Special Districts", "0.0950%", f"${fmt_num(special_rate)}"),
            ("", "", ""),
            ("TOTAL TAX DUE", "", f"${data['tax_amount']}"),
        ]
        draw_table(c, 50, y, tax_rows, col_widths=[250, 100, 150])

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
        draw_table(c, 50, y, rows, col_widths=[220, 140, 140])

        # Premium summary
        y -= len(rows) * 20 + 30
        c.setFont("Helvetica-Bold", 13)
        c.drawString(50, y, "Premium Summary")
        y -= 25

        premium_rows = [
            ("Component", "Amount"),
            ("Base Premium", f"${fmt_num(float(data['annual_premium'].replace(',', '')) * 0.7)}"),
            ("Wind/Hail Coverage", f"${fmt_num(float(data['annual_premium'].replace(',', '')) * 0.2)}"),
            ("Liability Coverage", f"${fmt_num(float(data['annual_premium'].replace(',', '')) * 0.1)}"),
            ("", ""),
            ("TOTAL ANNUAL PREMIUM", f"${data['annual_premium']}"),
        ]
        draw_table(c, 50, y, premium_rows, col_widths=[350, 150])

        c.save()
        return buf.getvalue()

    def _generate_generic(self, data: dict) -> bytes:
        elements = [
            Paragraph(data.get("form_type", "Tax Document"), TITLE_STYLE),
            Spacer(1, 12),
        ]
        for key, value in data.items():
            if key != "form_type":
                elements.append(Paragraph(f"<b>{key}:</b> {value}", NORMAL_STYLE))
        return self._build_pdf(elements)
