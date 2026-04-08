"""Generate test PDF fixtures with known values for E2E extraction accuracy tests.

Run: python e2e/fixtures/generate-test-docs.py
Requires: reportlab (pip install reportlab)

Each PDF is paired with a .expected.json file that contains the exact values
the extraction should produce. If extraction doesn't match, it's a bug.
"""
import json
import os
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

DOCS_DIR = Path(__file__).parent / "documents"
DOCS_DIR.mkdir(exist_ok=True)


def save_expected(filename: str, data: dict) -> None:
    path = DOCS_DIR / f"{filename}.expected.json"
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def make_invoice(filename: str, vendor: str, amount: float, date: str,
                 description: str, category: str, items: list[dict] | None = None):
    """Generate a simple invoice PDF."""
    path = DOCS_DIR / f"{filename}.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    w, h = letter

    # Header
    c.setFont("Helvetica-Bold", 20)
    c.drawString(1 * inch, h - 1 * inch, "INVOICE")

    # Vendor info
    c.setFont("Helvetica-Bold", 12)
    c.drawString(1 * inch, h - 1.6 * inch, f"From: {vendor}")
    c.setFont("Helvetica", 10)
    c.drawString(1 * inch, h - 1.9 * inch, f"Date: {date}")
    c.drawString(1 * inch, h - 2.1 * inch, f"Invoice #: INV-{filename.upper()[:6]}")

    # Bill to
    c.setFont("Helvetica-Bold", 10)
    c.drawString(4 * inch, h - 1.6 * inch, "Bill To:")
    c.setFont("Helvetica", 10)
    c.drawString(4 * inch, h - 1.9 * inch, "Test Property Owner")
    c.drawString(4 * inch, h - 2.1 * inch, "123 Main St, Testville TX 75001")

    # Line items
    y = h - 2.8 * inch
    c.setFont("Helvetica-Bold", 10)
    c.drawString(1 * inch, y, "Description")
    c.drawString(5 * inch, y, "Amount")
    c.line(1 * inch, y - 5, 7 * inch, y - 5)
    y -= 25

    c.setFont("Helvetica", 10)
    if items:
        for item in items:
            c.drawString(1 * inch, y, item["description"])
            c.drawString(5 * inch, y, f"${item['amount']:,.2f}")
            y -= 18
    else:
        c.drawString(1 * inch, y, description)
        c.drawString(5 * inch, y, f"${amount:,.2f}")
        y -= 18

    # Total
    c.line(1 * inch, y - 5, 7 * inch, y - 5)
    y -= 25
    c.setFont("Helvetica-Bold", 12)
    c.drawString(4 * inch, y, "Total Due:")
    c.drawString(5 * inch, y, f"${amount:,.2f}")

    # Payment terms
    y -= 40
    c.setFont("Helvetica", 9)
    c.drawString(1 * inch, y, "Payment Terms: Net 30")
    c.drawString(1 * inch, y - 15, "Please make checks payable to " + vendor)

    c.save()


def make_receipt(filename: str, vendor: str, amount: float, date: str,
                 description: str, category: str):
    """Generate a simple receipt PDF."""
    path = DOCS_DIR / f"{filename}.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    w, h = letter

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(w / 2, h - 1 * inch, vendor)
    c.setFont("Helvetica", 10)
    c.drawCentredString(w / 2, h - 1.3 * inch, "RECEIPT")
    c.drawCentredString(w / 2, h - 1.5 * inch, f"Date: {date}")

    y = h - 2.2 * inch
    c.setFont("Helvetica", 10)
    c.drawString(1.5 * inch, y, description)
    c.drawRightString(w - 1.5 * inch, y, f"${amount:,.2f}")

    y -= 30
    c.line(1.5 * inch, y, w - 1.5 * inch, y)
    y -= 20
    c.setFont("Helvetica-Bold", 11)
    c.drawString(1.5 * inch, y, "Total")
    c.drawRightString(w - 1.5 * inch, y, f"${amount:,.2f}")

    y -= 30
    c.setFont("Helvetica", 9)
    c.drawCentredString(w / 2, y, "Thank you for your business!")

    c.save()


def make_1099(filename: str, payer: str, recipient: str, amount: float,
              tax_year: int, form_type: str):
    """Generate a simple 1099 form PDF."""
    path = DOCS_DIR / f"{filename}.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    w, h = letter

    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(w / 2, h - 0.8 * inch, f"Form {form_type}")
    c.setFont("Helvetica", 10)
    c.drawCentredString(w / 2, h - 1.05 * inch, f"Tax Year {tax_year}")

    y = h - 1.6 * inch
    c.setFont("Helvetica-Bold", 10)
    c.drawString(1 * inch, y, "PAYER'S name:")
    c.setFont("Helvetica", 10)
    c.drawString(1 * inch, y - 15, payer)

    y -= 50
    c.setFont("Helvetica-Bold", 10)
    c.drawString(1 * inch, y, "RECIPIENT'S name:")
    c.setFont("Helvetica", 10)
    c.drawString(1 * inch, y - 15, recipient)

    y -= 50
    if form_type == "1099-NEC":
        c.setFont("Helvetica-Bold", 10)
        c.drawString(1 * inch, y, "1. Nonemployee compensation")
        c.setFont("Helvetica", 12)
        c.drawString(4.5 * inch, y, f"${amount:,.2f}")
    elif form_type == "1099-MISC":
        c.setFont("Helvetica-Bold", 10)
        c.drawString(1 * inch, y, "3. Other income")
        c.setFont("Helvetica", 12)
        c.drawString(4.5 * inch, y, f"${amount:,.2f}")
    elif form_type == "1099-K":
        c.setFont("Helvetica-Bold", 10)
        c.drawString(1 * inch, y, "1a. Gross amount of payment card/third party network transactions")
        c.setFont("Helvetica", 12)
        c.drawString(4.5 * inch, y - 15, f"${amount:,.2f}")

    c.save()


def make_year_end_statement(filename: str, platform: str, tax_year: int,
                            gross_amount: float, fees: float, net_amount: float,
                            reservation_count: int):
    """Generate a platform year-end statement PDF."""
    path = DOCS_DIR / f"{filename}.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    w, h = letter

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(w / 2, h - 1 * inch, f"{platform} Year-End Summary")
    c.setFont("Helvetica", 11)
    c.drawCentredString(w / 2, h - 1.3 * inch, f"Tax Year {tax_year}")
    c.drawCentredString(w / 2, h - 1.55 * inch, f"Total Reservations: {reservation_count}")

    y = h - 2.2 * inch
    rows = [
        ("Gross Earnings", f"${gross_amount:,.2f}"),
        ("Service Fees", f"-${fees:,.2f}"),
        ("Net Payout", f"${net_amount:,.2f}"),
    ]
    for label, val in rows:
        c.setFont("Helvetica", 11)
        c.drawString(1.5 * inch, y, label)
        c.drawRightString(w - 1.5 * inch, y, val)
        y -= 22

    c.save()


# ─── Schedule E: Rental Property Documents ───────────────────────────────────

make_invoice("plumber-invoice", "ABC Plumbing & Heating", 450.00,
             "March 15, 2025", "Water heater replacement and installation", "maintenance")
save_expected("plumber-invoice", {
    "description": "Plumber invoice for water heater replacement",
    "expected_transactions": [{
        "vendor": "ABC Plumbing & Heating",
        "amount": 450.00,
        "transaction_date": "2025-03-15",
        "transaction_type": "expense",
        "category": "maintenance",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

make_invoice("electrician-invoice", "Sparks Electric LLC", 275.00,
             "February 8, 2025", "Replaced GFCI outlets in kitchen and bathrooms", "maintenance")
save_expected("electrician-invoice", {
    "description": "Electrician invoice for outlet replacement",
    "expected_transactions": [{
        "vendor": "Sparks Electric LLC",
        "amount": 275.00,
        "transaction_date": "2025-02-08",
        "transaction_type": "expense",
        "category": "maintenance",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

make_receipt("electric-bill", "Texas Power & Light", 187.43,
             "January 22, 2025", "Monthly electric service - Account #482901", "utilities")
save_expected("electric-bill", {
    "description": "Monthly electric bill",
    "expected_transactions": [{
        "vendor": "Texas Power & Light",
        "amount": 187.43,
        "transaction_date": "2025-01-22",
        "transaction_type": "expense",
        "category": "utilities",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

make_invoice("insurance-policy", "State Farm Insurance", 1240.00,
             "January 1, 2025", "Annual landlord insurance premium - Policy #LLP-482901", "insurance")
save_expected("insurance-policy", {
    "description": "Annual landlord insurance premium",
    "expected_transactions": [{
        "vendor": "State Farm Insurance",
        "amount": 1240.00,
        "transaction_date": "2025-01-01",
        "transaction_type": "expense",
        "category": "insurance",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

make_invoice("property-management", "Coastal Property Mgmt", 350.00,
             "March 1, 2025", "Monthly property management fee - March 2025", "management_fee")
save_expected("property-management", {
    "description": "Monthly property management fee",
    "expected_transactions": [{
        "vendor": "Coastal Property Mgmt",
        "amount": 350.00,
        "transaction_date": "2025-03-01",
        "transaction_type": "expense",
        "category": "management_fee",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

make_invoice("cleaning-service", "Sparkle Clean Services", 125.00,
             "March 10, 2025", "Turnover cleaning between guests", "cleaning_expense")
save_expected("cleaning-service", {
    "description": "Turnover cleaning between guests",
    "expected_transactions": [{
        "vendor": "Sparkle Clean Services",
        "amount": 125.00,
        "transaction_date": "2025-03-10",
        "transaction_type": "expense",
        "category": "cleaning_expense",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

make_receipt("property-tax", "Dallas County Tax Office", 3200.00,
             "February 1, 2025", "2025 Property tax assessment - Parcel #12345", "taxes")
save_expected("property-tax", {
    "description": "Annual property tax",
    "expected_transactions": [{
        "vendor": "Dallas County Tax Office",
        "amount": 3200.00,
        "transaction_date": "2025-02-01",
        "transaction_type": "expense",
        "category": "taxes",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

make_invoice("landscaping", "Green Thumb Landscaping", 200.00,
             "April 5, 2025", "Monthly lawn care and garden maintenance", "contract_work")
save_expected("landscaping", {
    "description": "Monthly lawn care invoice",
    "expected_transactions": [{
        "vendor": "Green Thumb Landscaping",
        "amount": 200.00,
        "transaction_date": "2025-04-05",
        "transaction_type": "expense",
        "category": "contract_work",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

make_receipt("furniture-purchase", "IKEA", 849.99,
             "March 20, 2025", "MALM bed frame, NYHAMN sofa bed, LACK coffee table", "furnishings")
save_expected("furniture-purchase", {
    "description": "Furniture purchase for rental property",
    "expected_transactions": [{
        "vendor": "IKEA",
        "amount": 849.99,
        "transaction_date": "2025-03-20",
        "transaction_type": "expense",
        "category": "furnishings",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

make_invoice("attorney-invoice", "Smith & Associates Law Firm", 500.00,
             "February 15, 2025", "Lease review and tenant eviction consultation", "legal_professional")
save_expected("attorney-invoice", {
    "description": "Attorney invoice for lease review",
    "expected_transactions": [{
        "vendor": "Smith & Associates Law Firm",
        "amount": 500.00,
        "transaction_date": "2025-02-15",
        "transaction_type": "expense",
        "category": "legal_professional",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

make_invoice("advertising-invoice", "Facebook Ads", 150.00,
             "March 5, 2025", "Rental listing promotion - Beach House campaign", "advertising")
save_expected("advertising-invoice", {
    "description": "Facebook advertising for rental listing",
    "expected_transactions": [{
        "vendor": "Facebook Ads",
        "amount": 150.00,
        "transaction_date": "2025-03-05",
        "transaction_type": "expense",
        "category": "advertising",
        "tax_relevant": True,
    }],
    "expected_count": 1,
})

# ─── Schedule C: Self-Employed Documents ─────────────────────────────────────

make_invoice("consulting-revenue", "Acme Corp", 5000.00,
             "March 31, 2025", "Software consulting services - March 2025", "business_revenue")
save_expected("consulting-revenue", {
    "description": "Consulting income from client",
    "expected_transactions": [{
        "vendor": "Acme Corp",
        "amount": 5000.00,
        "transaction_date": "2025-03-31",
        "transaction_type": "income",
        "category": "rental_revenue",
        "tax_relevant": True,
    }],
    "expected_count": 1,
    "note": "category may need 'business_revenue' once Schedule C is supported",
})

make_receipt("office-supplies", "Staples", 89.47,
             "February 20, 2025", "Printer paper, ink cartridges, folders, pens", "other_expense")
save_expected("office-supplies", {
    "description": "Office supplies purchase",
    "expected_transactions": [{
        "vendor": "Staples",
        "amount": 89.47,
        "transaction_date": "2025-02-20",
        "transaction_type": "expense",
        "category": "other_expense",
        "tax_relevant": True,
    }],
    "expected_count": 1,
    "note": "category may change to 'office_supplies' once Schedule C is supported",
})

make_invoice("software-subscription", "Adobe Inc.", 54.99,
             "March 1, 2025", "Creative Cloud monthly subscription", "other_expense")
save_expected("software-subscription", {
    "description": "Software subscription",
    "expected_transactions": [{
        "vendor": "Adobe Inc.",
        "amount": 54.99,
        "transaction_date": "2025-03-01",
        "transaction_type": "expense",
        "category": "other_expense",
        "tax_relevant": True,
    }],
    "expected_count": 1,
    "note": "category may change to 'software_subscriptions' once Schedule C is supported",
})

# ─── 1099 Tax Forms ──────────────────────────────────────────────────────────

make_1099("1099-nec-client", "Acme Corp", "Test User", 45000.00, 2024, "1099-NEC")
save_expected("1099-nec-client", {
    "description": "1099-NEC from client for freelance work",
    "document_type": "tax_form",
    "expected_transactions": [],
    "expected_count": 0,
    "expected_metadata": {
        "form_type": "1099-NEC",
        "payer": "Acme Corp",
        "recipient": "Test User",
        "amount": 45000.00,
        "tax_year": 2024,
    },
    "note": "Tax forms should extract metadata, not create expense transactions",
})

make_1099("1099-k-airbnb", "Airbnb Payments Inc.", "Test User", 28500.00, 2024, "1099-K")
save_expected("1099-k-airbnb", {
    "description": "1099-K from Airbnb for rental income",
    "document_type": "tax_form",
    "expected_transactions": [],
    "expected_count": 0,
    "expected_metadata": {
        "form_type": "1099-K",
        "payer": "Airbnb Payments Inc.",
        "recipient": "Test User",
        "amount": 28500.00,
        "tax_year": 2024,
    },
    "note": "Tax forms should extract metadata, not create expense transactions",
})

# ─── Year-End Statement ──────────────────────────────────────────────────────

make_year_end_statement("airbnb-year-end", "Airbnb", 2024,
                        gross_amount=32000.00, fees=4800.00, net_amount=27200.00,
                        reservation_count=45)
save_expected("airbnb-year-end", {
    "description": "Airbnb year-end summary statement",
    "document_type": "year_end_statement",
    "expected_transactions": [],
    "expected_count": 0,
    "expected_reservations": True,
    "note": "Year-end statements should produce reservation records, not expense transactions",
})

# ─── Multi-Item Invoice ──────────────────────────────────────────────────────

make_invoice("multi-item-invoice", "Home Depot", 523.47,
             "March 18, 2025", "Multiple items",  "maintenance",
             items=[
                 {"description": "Water heater thermostat", "amount": 45.99},
                 {"description": "Copper pipe fittings (12 pack)", "amount": 32.48},
                 {"description": "PEX tubing 100ft", "amount": 89.00},
                 {"description": "Bathroom faucet set", "amount": 156.00},
                 {"description": "Toilet flapper valves (3 pack)", "amount": 24.00},
                 {"description": "Caulk and sealant", "amount": 18.00},
                 {"description": "Labor/delivery", "amount": 158.00},
             ])
save_expected("multi-item-invoice", {
    "description": "Home Depot invoice with multiple maintenance items",
    "expected_transactions": [{
        "vendor": "Home Depot",
        "amount": 523.47,
        "transaction_date": "2025-03-18",
        "transaction_type": "expense",
        "category": "maintenance",
        "tax_relevant": True,
    }],
    "expected_count": 1,
    "note": "Multi-item invoices with one vendor should produce one transaction with the total amount",
})

print(f"Generated {len(list(DOCS_DIR.glob('*.pdf')))} test PDFs in {DOCS_DIR}")
print(f"Generated {len(list(DOCS_DIR.glob('*.expected.json')))} expected manifests")
