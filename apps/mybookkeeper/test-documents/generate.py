"""Generate test documents for manual QA testing."""
import os
import uuid
from openpyxl import Workbook
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT = os.path.dirname(__file__)


def make_utility_bill():
    c = canvas.Canvas(f"{OUT}/bill_CenterPoint_Energy_Oct2025.pdf", pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, 740, "CenterPoint Energy")
    c.setFont("Helvetica", 10)
    c.drawString(72, 720, "P.O. Box 4981, Houston, TX 77210")
    c.drawString(72, 700, "Account Number: 4012-3456-7890")
    c.drawString(72, 680, "Service Address: 6738 Peerless St, Houston, TX 77021")
    c.drawString(72, 660, "Billing Period: 09/15/2025 - 10/14/2025")
    c.drawString(72, 640, "Bill Date: October 15, 2025")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, 610, "Amount Due: $47.83")
    c.setFont("Helvetica", 10)
    c.drawString(72, 590, "Due Date: November 5, 2025")
    c.drawString(72, 560, "Usage Summary:")
    c.drawString(90, 540, "Natural Gas: 12 CCF")
    c.drawString(90, 525, "Distribution Charge: $18.50")
    c.drawString(90, 510, "Gas Cost: $24.33")
    c.drawString(90, 495, "Rider Charges: $5.00")
    c.drawString(72, 465, "Payment Method: AutoPay - Bank Account ending 4521")
    c.save()


def make_contractor_invoice():
    c = canvas.Canvas(f"{OUT}/invoice_ABC_Plumbing_Nov2025.pdf", pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, 740, "ABC Plumbing Services")
    c.setFont("Helvetica", 10)
    c.drawString(72, 720, "License #PLB-2024-1234")
    c.drawString(72, 700, "1500 Main St, Houston, TX 77002")
    c.line(72, 690, 540, 690)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, 670, "INVOICE #1087")
    c.setFont("Helvetica", 10)
    c.drawString(72, 650, "Date: November 8, 2025")
    c.drawString(72, 635, "Bill To: Jason Kwon")
    c.drawString(72, 620, "Property: 6732 Peerless St, Houston, TX 77021")
    c.drawString(72, 595, "Description:")
    c.drawString(90, 575, "1. Replace kitchen faucet and supply lines - $185.00")
    c.drawString(90, 560, "2. Snake main drain line (50ft) - $275.00")
    c.drawString(90, 545, "3. Replace wax ring on master bath toilet - $95.00")
    c.drawString(90, 530, "4. Parts and materials - $120.00")
    c.line(72, 520, 540, 520)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(72, 500, "Total: $675.00")
    c.setFont("Helvetica", 10)
    c.drawString(72, 480, "Payment: Check #3042")
    c.save()


def make_insurance_policy():
    c = canvas.Canvas(f"{OUT}/policy_StateFarm_6738Peerless_2025.pdf", pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, 740, "State Farm Insurance")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, 710, "Landlord Property Insurance - Declarations Page")
    c.setFont("Helvetica", 10)
    c.drawString(72, 690, "Policy Number: 98-BK-7234-1")
    c.drawString(72, 675, "Policy Period: 01/01/2025 - 12/31/2025")
    c.drawString(72, 660, "Named Insured: Jason Kwon")
    c.drawString(72, 645, "Property Address: 6738 Peerless St, Houston, TX 77021")
    c.line(72, 635, 540, 635)
    c.drawString(72, 615, "Coverage A - Dwelling: $250,000")
    c.drawString(72, 600, "Coverage B - Other Structures: $25,000")
    c.drawString(72, 585, "Coverage E - Liability: $300,000")
    c.line(72, 575, 540, 575)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(72, 555, "Annual Premium: $1,842.00")
    c.setFont("Helvetica", 10)
    c.drawString(72, 535, "Payment: Paid in full - Bank Transfer 01/05/2025")
    c.save()


def make_pm_statement():
    c = canvas.Canvas(f"{OUT}/statement_Vello_Jan2025.pdf", pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, 740, "Vello Property Management")
    c.setFont("Helvetica", 10)
    c.drawString(72, 720, "Owner Statement - January 2025")
    c.drawString(72, 705, "Property: 6738 Peerless St, Houston, TX 77021")
    c.drawString(72, 690, "Owner: Jason Kwon")
    c.line(72, 680, 540, 680)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(72, 660, "Reservation Details")
    c.setFont("Helvetica", 9)
    c.drawString(72, 645, "Res Code    Guest             Check-in    Check-out   Revenue     Commission  Net")
    c.line(72, 640, 560, 640)
    rows = [
        ("HM4X7K2P", "Sarah Johnson", "01/03/2025", "01/07/2025", "$780.00", "$117.00", "$663.00"),
        ("HM5Y8L3Q", "Mike Chen", "01/10/2025", "01/15/2025", "$1,150.00", "$172.50", "$977.50"),
        ("HM6Z9M4R", "Lisa Park", "01/18/2025", "01/21/2025", "$585.00", "$87.75", "$497.25"),
        ("HM7A0N5S", "Tom Wilson", "01/24/2025", "01/31/2025", "$1,540.00", "$231.00", "$1,309.00"),
    ]
    y = 625
    for r in rows:
        c.drawString(72, y, f"{r[0]}  {r[1]:18s} {r[2]}   {r[3]}   {r[4]:>10s} {r[5]:>10s} {r[6]:>10s}")
        y -= 14
    c.line(72, y + 5, 560, y + 5)
    c.setFont("Helvetica-Bold", 10)
    y -= 15
    c.drawString(72, y, "Totals: Revenue $4,055.00 | Commission $608.25 | Net $3,446.75")
    y -= 30
    c.drawString(72, y, "Funds Due to Client: $2,253.50")
    c.drawString(72, y - 15, "Funds Due to Vello: $1,193.25")
    c.save()


def make_mortgage_statement():
    c = canvas.Canvas(f"{OUT}/mortgage_WellsFargo_Dec2025.pdf", pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, 740, "Wells Fargo Home Mortgage")
    c.setFont("Helvetica", 10)
    c.drawString(72, 720, "Monthly Mortgage Statement")
    c.drawString(72, 700, "Account Number: 5678-9012-3456")
    c.drawString(72, 685, "Property: 6738 Peerless St, Houston, TX 77021")
    c.drawString(72, 670, "Borrower: Jason Kwon")
    c.line(72, 660, 540, 660)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, 640, "Total Payment Due: $1,247.33")
    c.setFont("Helvetica", 10)
    c.drawString(72, 615, "Payment Breakdown:")
    c.drawString(90, 595, "Principal:        $389.42")
    c.drawString(90, 580, "Interest:         $712.18")
    c.drawString(90, 565, "Escrow:           $145.73")
    c.drawString(72, 540, "Due Date: December 15, 2025")
    c.drawString(72, 525, "Loan Balance: $178,234.56")
    c.save()


def make_property_tax():
    c = canvas.Canvas(f"{OUT}/tax_HarrisCounty_6738Peerless_2025.pdf", pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, 740, "Harris County Tax Office")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, 710, "2025 Property Tax Statement")
    c.setFont("Helvetica", 10)
    c.drawString(72, 690, "Property: 6738 Peerless St, Houston, TX 77021")
    c.drawString(72, 675, "Owner: Jason Kwon")
    c.drawString(72, 655, "Appraised Value: $285,000")
    c.line(72, 645, 540, 645)
    c.drawString(90, 625, "Harris County:       $1,425.00")
    c.drawString(90, 610, "Houston ISD:         $2,137.50")
    c.drawString(90, 595, "City of Houston:       $855.00")
    c.drawString(90, 580, "Flood Control:         $171.00")
    c.drawString(90, 565, "Port of Houston:        $85.50")
    c.line(90, 555, 350, 555)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(90, 540, "Total Tax Due: $4,674.00")
    c.setFont("Helvetica", 10)
    c.drawString(72, 515, "Due Date: January 31, 2026")
    c.save()


def make_expense_spreadsheet():
    wb = Workbook()
    ws = wb.active
    ws.title = "Property Expenses Q4 2025"
    ws.append(["Date", "Vendor", "Description", "Amount", "Category", "Property", "Payment Method"])
    expenses = [
        ("2025-10-03", "Home Depot", "Smoke detectors (3 units)", 67.47, "Maintenance", "6738 Peerless St", "Credit Card"),
        ("2025-10-08", "Lowes", "Paint supplies - interior touch-up", 134.22, "Maintenance", "6732 Peerless St", "Credit Card"),
        ("2025-10-15", "Jason Lawn Guy", "Monthly lawn care", 150.00, "Contract Work", "6738 Peerless St", "Zelle"),
        ("2025-10-22", "Ace Hardware", "Door locks replacement (2)", 89.98, "Maintenance", "6734 Peerless St", "Credit Card"),
        ("2025-11-01", "Waste Management", "Monthly trash service", 45.00, "Utilities", "6738 Peerless St", "AutoPay"),
        ("2025-11-05", "ADT Security", "Monthly monitoring", 39.99, "Other Expense", "6738 Peerless St", "Credit Card"),
        ("2025-11-12", "Jason Lawn Guy", "Fall cleanup + leaf removal", 275.00, "Contract Work", "6738 Peerless St", "Zelle"),
        ("2025-11-18", "Sherwin Williams", "Exterior paint - 5 gallons", 247.50, "Maintenance", "6732 Peerless St", "Credit Card"),
        ("2025-12-01", "AT&T", "Internet service", 65.00, "Utilities", "6738 Peerless St", "AutoPay"),
        ("2025-12-03", "Terminix", "Quarterly pest control", 125.00, "Maintenance", "6734 Peerless St", "Check"),
        ("2025-12-10", "Jason Lawn Guy", "Monthly lawn care", 150.00, "Contract Work", "6738 Peerless St", "Zelle"),
        ("2025-12-15", "Sams Club", "Cleaning supplies bulk", 78.33, "Cleaning Expense", "6738 Peerless St", "Credit Card"),
        ("2025-12-20", "Sergio Garcia", "Bathroom tile repair", 450.00, "Contract Work", "6732 Peerless St", "Venmo"),
        ("2025-12-28", "Home Depot", "Water heater replacement", 1850.00, "Capital Improvement", "6734 Peerless St", "Credit Card"),
    ]
    for exp in expenses:
        ws.append(list(exp))
    for col, w in [("A", 12), ("B", 18), ("C", 35), ("D", 12), ("E", 18), ("F", 22), ("G", 16)]:
        ws.column_dimensions[col].width = w
    wb.save(f"{OUT}/expenses_Q4_2025.xlsx")


def make_1099k():
    c = canvas.Canvas(f"{OUT}/1099-K_Airbnb_2025.pdf", pagesize=letter)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(72, 740, "Form 1099-K")
    c.setFont("Helvetica", 10)
    c.drawString(72, 725, "Payment Card and Third Party Network Transactions")
    c.drawString(72, 710, "Tax Year 2025")
    c.line(72, 700, 540, 700)
    c.drawString(72, 680, "FILER: Airbnb Payments, Inc. (TIN: 46-4364855)")
    c.drawString(72, 665, "PAYEE: Jason Kwon (SSN: ***-**-4567)")
    c.drawString(72, 650, "6738 Peerless St, Houston, TX 77021")
    c.line(72, 640, 540, 640)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(72, 620, "Box 1a. Gross amount: $42,850.00")
    c.setFont("Helvetica", 10)
    c.drawString(72, 600, "Box 1b. Card not present: $42,850.00")
    c.drawString(72, 585, "Box 3. Number of transactions: 48")
    c.drawString(72, 570, "Box 4. Federal tax withheld: $0.00")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(72, 545, "Monthly Breakdown:")
    c.setFont("Helvetica", 9)
    months = ["Jan $3,250", "Feb $2,890", "Mar $3,680", "Apr $3,450", "May $4,120", "Jun $4,350",
              "Jul $4,580", "Aug $4,210", "Sep $3,890", "Oct $3,650", "Nov $2,480", "Dec $2,300"]
    y = 530
    for m in months:
        c.drawString(90, y, m)
        y -= 13
    c.save()


def make_w2():
    c = canvas.Canvas(f"{OUT}/W2_Acme_Corp_2025.pdf", pagesize=letter)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(72, 740, "Form W-2 Wage and Tax Statement 2025")
    c.setFont("Helvetica", 10)
    c.drawString(72, 720, "Employer: Acme Corporation (EIN: 74-1234567)")
    c.drawString(72, 705, "Employee: Jason Kwon (SSN: ***-**-4567)")
    c.line(72, 695, 540, 695)
    fields = [
        ("Box 1 - Wages:", "$78,500.00"),
        ("Box 2 - Federal tax withheld:", "$13,245.00"),
        ("Box 3 - Social security wages:", "$78,500.00"),
        ("Box 4 - Social security tax:", "$4,867.00"),
        ("Box 5 - Medicare wages:", "$78,500.00"),
        ("Box 6 - Medicare tax:", "$1,138.25"),
    ]
    y = 675
    for label, value in fields:
        c.drawString(72, y, label)
        c.drawString(350, y, value)
        y -= 18
    c.save()


def make_1098():
    c = canvas.Canvas(f"{OUT}/1098_WellsFargo_2025.pdf", pagesize=letter)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(72, 740, "Form 1098 - Mortgage Interest Statement")
    c.setFont("Helvetica", 10)
    c.drawString(72, 720, "Tax Year 2025")
    c.drawString(72, 700, "Lender: Wells Fargo Bank, N.A. (TIN: 94-1347393)")
    c.drawString(72, 685, "Borrower: Jason Kwon")
    c.drawString(72, 670, "Property: 6738 Peerless St, Houston, TX 77021")
    c.line(72, 660, 540, 660)
    fields = [
        ("Box 1 - Mortgage interest received:", "$8,546.16"),
        ("Box 2 - Outstanding mortgage principal:", "$178,234.56"),
        ("Box 5 - Mortgage origination date:", "03/15/2020"),
    ]
    y = 640
    for label, value in fields:
        c.drawString(72, y, label)
        c.drawString(350, y, value)
        y -= 20
    c.save()


def make_empty_file():
    with open(f"{OUT}/empty_file.pdf", "wb"):
        pass


if __name__ == "__main__":
    print(f"Generating test documents in {os.path.abspath(OUT)}/\n")
    generators = [
        ("Utility bill (CenterPoint Energy)", make_utility_bill),
        ("Contractor invoice (ABC Plumbing)", make_contractor_invoice),
        ("Insurance policy (State Farm)", make_insurance_policy),
        ("PM statement (Vello Jan 2025)", make_pm_statement),
        ("Mortgage statement (Wells Fargo)", make_mortgage_statement),
        ("Property tax (Harris County)", make_property_tax),
        ("Expense spreadsheet (Q4 2025)", make_expense_spreadsheet),
        ("1099-K (Airbnb)", make_1099k),
        ("W-2 (Acme Corp)", make_w2),
        ("1098 (Wells Fargo)", make_1098),
        ("Empty file (for rejection test)", make_empty_file),
    ]
    for name, gen in generators:
        gen()
        print(f"  Created: {name}")
    print(f"\nDone! {len(generators)} files created.")
