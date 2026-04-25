"""Shared PDF layout primitives for demo document generators."""

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfgen import canvas

_styles = getSampleStyleSheet()
TITLE_STYLE = ParagraphStyle(
    "DocTitle", parent=_styles["Heading1"], fontSize=16, spaceAfter=6,
)
NORMAL_STYLE = _styles["Normal"]

# IRS form colors
IRS_RED = colors.Color(0.72, 0.0, 0.0)


def draw_irs_header(
    c: canvas.Canvas, w: float, h: float,
    form_number: str, tax_year: str, title: str, copy_label: str,
) -> None:
    """Draw the standard IRS form header with red form number and title."""
    # Red line across top
    c.setStrokeColor(IRS_RED)
    c.setLineWidth(2)
    c.line(36, h - 18, w - 36, h - 18)

    # Form number (red, top-left)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(IRS_RED)
    c.drawString(36, h - 32, f"Form {form_number}")

    # Tax year
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(IRS_RED)
    c.drawCentredString(w / 2 - 40, h - 36, tax_year)

    # Title (centered)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.black)
    lines = title.split("\n")
    for i, line in enumerate(lines):
        c.drawCentredString(w / 2 + 20, h - 50 - i * 12, line)

    # Copy label (top-right)
    c.setFont("Helvetica", 8)
    c.setFillColor(IRS_RED)
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


def draw_irs_footer(
    c: canvas.Canvas, w: float, form_name: str, tax_year: str, dept: str,
) -> None:
    """Draw the standard IRS form footer."""
    c.setStrokeColor(IRS_RED)
    c.setLineWidth(1)
    c.line(36, 50, w - 36, 50)

    c.setFont("Helvetica", 7)
    c.setFillColor(colors.Color(0.4, 0.4, 0.4))
    c.drawString(36, 38, f"{form_name} (Rev. 1-{tax_year})")
    c.drawRightString(w - 36, 38, dept)


def draw_labeled_box(
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
    max_chars = int(w / 3.2)
    display_label = label[:max_chars] + "..." if len(label) > max_chars else label
    c.drawString(x + 3, y - 9, display_label)

    # Value (Courier, larger)
    c.setFont("Courier", 9)
    c.setFillColor(colors.black)
    lines = value.split("\n")
    for i, line in enumerate(lines):
        c.drawString(x + 5, y - 20 - i * 11, line)


def draw_amount_box(
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


def draw_w2_box(
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


def draw_table(
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


def split_address_street(address: str) -> str:
    """Get the street portion of a comma-separated address."""
    parts = address.split(",")
    return parts[0].strip() if parts else address


def split_address_city(address: str) -> str:
    """Get the city/state/zip portion of a comma-separated address."""
    parts = address.split(",", 1)
    return parts[1].strip() if len(parts) > 1 else ""


def fmt_num(val: float) -> str:
    """Format a number with commas and 2 decimal places."""
    return f"{val:,.2f}"


def month_name_from_date(date_str: str) -> str:
    """Extract month name from YYYY-MM-DD string."""
    months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]
    month_idx = int(date_str.split("-")[1]) - 1
    return months[month_idx]


def make_account_number(vendor: str) -> str:
    """Generate a realistic account number from vendor name."""
    seed = sum(ord(c) for c in vendor) % 900000 + 100000
    return f"{seed:06d}-{(seed * 7) % 9000 + 1000}"


def make_invoice_number(vendor: str, date_str: str) -> str:
    """Generate a deterministic invoice number."""
    seed = sum(ord(c) for c in vendor + date_str)
    prefix = vendor[:3].upper().replace(" ", "")
    return f"INV-{prefix}-{seed % 90000 + 10000}"


def make_loan_number(vendor: str) -> str:
    """Generate a deterministic loan number."""
    seed = sum(ord(c) for c in vendor) % 9000000 + 1000000
    return f"ML-{seed}"


def vendor_address(vendor: str) -> str:
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
    return addresses.get(vendor, "123 Business Ave, Anytown, USA")


def vendor_contact(vendor: str) -> str:
    """Return a realistic phone/email for a vendor."""
    seed = sum(ord(c) for c in vendor) % 900 + 100
    area = {
        "Los Angeles": "213", "Austin": "512", "Nashville": "615",
        "San Francisco": "415", "Dallas": "214", "Atlanta": "404",
    }
    for city_name, code in area.items():
        if city_name.lower() in vendor_address(vendor).lower():
            return f"({code}) 555-{seed:04d} | info@{vendor.lower().replace(' ', '').replace('&', '')[:12]}.com"
    return f"(800) 555-{seed:04d} | info@{vendor.lower().replace(' ', '').replace('&', '')[:12]}.com"


def get_usage_info(sub_category: str, amount: float) -> list[tuple[str, str, str]]:
    """Generate realistic usage details for utility bills."""
    if sub_category == "electricity":
        kwh = int(amount / 0.18)
        return [
            ("Electricity usage", f"{kwh} kWh @ $0.18/kWh", f"${fmt_num(kwh * 0.18)}"),
            ("Distribution charge", "", f"${fmt_num(amount * 0.12)}"),
            ("Taxes & fees", "", f"${fmt_num(amount - kwh * 0.18 - amount * 0.12)}"),
        ]
    elif sub_category == "water":
        gallons = int(amount / 0.008)
        return [
            ("Water usage", f"{gallons:,} gal @ $0.008/gal", f"${fmt_num(gallons * 0.008)}"),
            ("Sewer service", "", f"${fmt_num(amount * 0.3)}"),
            ("Base charge", "", f"${fmt_num(amount - gallons * 0.008 - amount * 0.3)}"),
        ]
    elif sub_category == "gas":
        therms = int(amount / 1.2)
        return [
            ("Natural gas usage", f"{therms} therms @ $1.20/therm", f"${fmt_num(therms * 1.2)}"),
            ("Delivery charge", "", f"${fmt_num(amount * 0.15)}"),
            ("Taxes & fees", "", f"${fmt_num(amount - therms * 1.2 - amount * 0.15)}"),
        ]
    else:  # internet
        return [
            ("Internet service — 500 Mbps plan", "", f"${fmt_num(amount * 0.85)}"),
            ("Equipment rental (modem/router)", "", f"${fmt_num(amount * 0.10)}"),
            ("Taxes & surcharges", "", f"${fmt_num(amount * 0.05)}"),
        ]


def estimate_nights(gross: float) -> str:
    """Estimate number of guest-nights from gross revenue."""
    avg_nightly = 180
    nights = max(1, int(gross / avg_nightly))
    return str(nights)
