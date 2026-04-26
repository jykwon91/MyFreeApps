"""Constants for demo user seed data."""

import re
import secrets

DEMO_EMAIL_DOMAIN = "mybookkeeper.com"
DEMO_EMAIL_PREFIX = "demo"


def generate_demo_password() -> str:
    return secrets.token_urlsafe(16)


def make_demo_slug(tag: str) -> str:
    slug = tag.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug


def make_demo_email(tag: str) -> str:
    slug = make_demo_slug(tag)
    return f"{DEMO_EMAIL_PREFIX}+{slug}@{DEMO_EMAIL_DOMAIN}"


def make_demo_org_name(tag: str) -> str:
    return f"Demo - {tag.strip()}"


def make_demo_display_name(tag: str) -> str:
    return f"Demo ({tag.strip()})"


DEMO_PROPERTIES = [
    {
        "name": "Sunset Villa",
        "type": "short_term",
        "address": "1234 Sunset Blvd, Los Angeles, CA 90028",
    },
    {
        "name": "Oak Street Duplex",
        "type": "long_term",
        "address": "567 Oak St, Austin, TX 78701",
    },
    {
        "name": "Downtown Loft",
        "type": "short_term",
        "address": "890 Main St, Nashville, TN 37201",
    },
]

# Each tuple: (property_index, date, vendor, description, amount, type, category, schedule_e_line, tags, sub_category)
# sub_category is optional (None for non-utility transactions)
# Property indexes: 0=Sunset Villa (LA), 1=Oak Street Duplex (Austin), 2=Downtown Loft (Nashville)
DEMO_TRANSACTIONS: list[tuple[int, str, str, str, str, str, str, str | None, list[str], str | None]] = [
    # ==========================================================================
    # REVENUE — Sunset Villa (Airbnb short-term, seasonal LA market)
    # ==========================================================================
    (0, "2025-01-15", "Airbnb", "January payout — Sunset Villa", "1800.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-02-15", "Airbnb", "February payout — Sunset Villa", "2200.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-03-15", "Airbnb", "March payout — Sunset Villa", "2800.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-04-15", "Airbnb", "April payout — Sunset Villa", "3200.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-05-15", "Airbnb", "May payout — Sunset Villa", "3800.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-06-15", "Airbnb", "June payout — Sunset Villa", "4200.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-07-15", "Airbnb", "July payout — Sunset Villa", "4100.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-08-15", "Airbnb", "August payout — Sunset Villa", "3900.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-09-15", "Airbnb", "September payout — Sunset Villa", "3400.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-10-15", "Airbnb", "October payout — Sunset Villa", "2600.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-11-15", "Airbnb", "November payout — Sunset Villa", "2000.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (0, "2025-12-15", "Airbnb", "December payout — Sunset Villa", "1500.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),

    # ==========================================================================
    # REVENUE — Oak Street Duplex (long-term tenant, consistent rent)
    # ==========================================================================
    (1, "2025-01-01", "Tenant - Sarah Johnson", "January rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-02-01", "Tenant - Sarah Johnson", "February rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-03-01", "Tenant - Sarah Johnson", "March rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-04-01", "Tenant - Sarah Johnson", "April rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-05-01", "Tenant - Sarah Johnson", "May rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-06-01", "Tenant - Sarah Johnson", "June rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-07-01", "Tenant - Sarah Johnson", "July rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-08-01", "Tenant - Sarah Johnson", "August rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-09-01", "Tenant - Sarah Johnson", "September rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-10-01", "Tenant - Sarah Johnson", "October rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-11-01", "Tenant - Sarah Johnson", "November rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),
    (1, "2025-12-01", "Tenant - Sarah Johnson", "December rent", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["tenant"], None),

    # ==========================================================================
    # REVENUE — Downtown Loft (Airbnb short-term, Nashville market)
    # ==========================================================================
    (2, "2025-01-15", "Airbnb", "January payout — Downtown Loft", "1200.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-02-15", "Airbnb", "February payout — Downtown Loft", "1400.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-03-15", "Airbnb", "March payout — Downtown Loft (music festival)", "3600.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-04-15", "Airbnb", "April payout — Downtown Loft", "2200.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-05-15", "Airbnb", "May payout — Downtown Loft", "2600.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-06-15", "Airbnb", "June payout — Downtown Loft (CMA Fest)", "3000.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-07-15", "Airbnb", "July payout — Downtown Loft", "2800.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-08-15", "Airbnb", "August payout — Downtown Loft", "2400.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-09-15", "Airbnb", "September payout — Downtown Loft", "2000.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-10-15", "Airbnb", "October payout — Downtown Loft", "1800.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-11-15", "Airbnb", "November payout — Downtown Loft", "1600.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),
    (2, "2025-12-15", "Airbnb", "December payout — Downtown Loft", "1400.00", "income", "rental_revenue", "line_3_rents_received", ["airbnb"], None),

    # ==========================================================================
    # UTILITIES — Sunset Villa (CA — electricity, water, gas, internet)
    # sub_category: electricity, water, gas, internet
    # ==========================================================================
    # Electric (SoCal Edison) — higher in summer (AC)
    (0, "2025-01-10", "SoCal Edison", "Electric bill — January", "95.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-02-10", "SoCal Edison", "Electric bill — February", "88.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-03-10", "SoCal Edison", "Electric bill — March", "92.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-04-10", "SoCal Edison", "Electric bill — April", "105.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-05-10", "SoCal Edison", "Electric bill — May", "130.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-06-10", "SoCal Edison", "Electric bill — June", "165.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-07-10", "SoCal Edison", "Electric bill — July", "195.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-08-10", "SoCal Edison", "Electric bill — August", "185.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-09-10", "SoCal Edison", "Electric bill — September", "155.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-10-10", "SoCal Edison", "Electric bill — October", "110.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-11-10", "SoCal Edison", "Electric bill — November", "90.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (0, "2025-12-10", "SoCal Edison", "Electric bill — December", "85.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    # Water (LADWP)
    (0, "2025-01-15", "LADWP", "Water bill — January", "45.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-02-15", "LADWP", "Water bill — February", "42.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-03-15", "LADWP", "Water bill — March", "48.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-04-15", "LADWP", "Water bill — April", "55.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-05-15", "LADWP", "Water bill — May", "62.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-06-15", "LADWP", "Water bill — June", "70.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-07-15", "LADWP", "Water bill — July", "75.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-08-15", "LADWP", "Water bill — August", "72.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-09-15", "LADWP", "Water bill — September", "65.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-10-15", "LADWP", "Water bill — October", "52.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-11-15", "LADWP", "Water bill — November", "46.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (0, "2025-12-15", "LADWP", "Water bill — December", "44.00", "expense", "utilities", "line_17_utilities", [], "water"),
    # Gas (SoCalGas) — higher in winter (heating)
    (0, "2025-01-20", "SoCalGas", "Gas bill — January", "55.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-02-20", "SoCalGas", "Gas bill — February", "50.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-03-20", "SoCalGas", "Gas bill — March", "42.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-04-20", "SoCalGas", "Gas bill — April", "35.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-05-20", "SoCalGas", "Gas bill — May", "30.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-06-20", "SoCalGas", "Gas bill — June", "28.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-07-20", "SoCalGas", "Gas bill — July", "25.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-08-20", "SoCalGas", "Gas bill — August", "25.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-09-20", "SoCalGas", "Gas bill — September", "30.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-10-20", "SoCalGas", "Gas bill — October", "38.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-11-20", "SoCalGas", "Gas bill — November", "48.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (0, "2025-12-20", "SoCalGas", "Gas bill — December", "58.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    # Internet (Spectrum)
    (0, "2025-01-05", "Spectrum", "Internet service — January", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-02-05", "Spectrum", "Internet service — February", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-03-05", "Spectrum", "Internet service — March", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-04-05", "Spectrum", "Internet service — April", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-05-05", "Spectrum", "Internet service — May", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-06-05", "Spectrum", "Internet service — June", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-07-05", "Spectrum", "Internet service — July", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-08-05", "Spectrum", "Internet service — August", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-09-05", "Spectrum", "Internet service — September", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-10-05", "Spectrum", "Internet service — October", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-11-05", "Spectrum", "Internet service — November", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (0, "2025-12-05", "Spectrum", "Internet service — December", "69.99", "expense", "utilities", "line_17_utilities", [], "internet"),

    # ==========================================================================
    # UTILITIES — Oak Street Duplex (TX — electricity, water, gas, internet)
    # ==========================================================================
    # Electric (Austin Energy) — very high in summer (TX heat)
    (1, "2025-01-12", "Austin Energy", "Electric bill — January", "110.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-02-12", "Austin Energy", "Electric bill — February", "105.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-03-12", "Austin Energy", "Electric bill — March", "98.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-04-12", "Austin Energy", "Electric bill — April", "115.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-05-12", "Austin Energy", "Electric bill — May", "145.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-06-12", "Austin Energy", "Electric bill — June", "185.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-07-12", "Austin Energy", "Electric bill — July", "210.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-08-12", "Austin Energy", "Electric bill — August", "205.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-09-12", "Austin Energy", "Electric bill — September", "170.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-10-12", "Austin Energy", "Electric bill — October", "125.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-11-12", "Austin Energy", "Electric bill — November", "108.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (1, "2025-12-12", "Austin Energy", "Electric bill — December", "112.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    # Water (Austin Water)
    (1, "2025-01-18", "Austin Water", "Water bill — January", "52.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-02-18", "Austin Water", "Water bill — February", "48.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-03-18", "Austin Water", "Water bill — March", "55.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-04-18", "Austin Water", "Water bill — April", "60.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-05-18", "Austin Water", "Water bill — May", "68.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-06-18", "Austin Water", "Water bill — June", "75.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-07-18", "Austin Water", "Water bill — July", "80.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-08-18", "Austin Water", "Water bill — August", "78.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-09-18", "Austin Water", "Water bill — September", "70.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-10-18", "Austin Water", "Water bill — October", "58.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-11-18", "Austin Water", "Water bill — November", "50.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (1, "2025-12-18", "Austin Water", "Water bill — December", "52.00", "expense", "utilities", "line_17_utilities", [], "water"),
    # Gas (Texas Gas Service) — higher in winter
    (1, "2025-01-22", "Texas Gas Service", "Gas bill — January", "58.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-02-22", "Texas Gas Service", "Gas bill — February", "52.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-03-22", "Texas Gas Service", "Gas bill — March", "42.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-04-22", "Texas Gas Service", "Gas bill — April", "35.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-05-22", "Texas Gas Service", "Gas bill — May", "30.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-06-22", "Texas Gas Service", "Gas bill — June", "25.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-07-22", "Texas Gas Service", "Gas bill — July", "22.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-08-22", "Texas Gas Service", "Gas bill — August", "22.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-09-22", "Texas Gas Service", "Gas bill — September", "28.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-10-22", "Texas Gas Service", "Gas bill — October", "38.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-11-22", "Texas Gas Service", "Gas bill — November", "50.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (1, "2025-12-22", "Texas Gas Service", "Gas bill — December", "55.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    # Internet (AT&T Fiber)
    (1, "2025-01-08", "AT&T", "Internet service — January", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-02-08", "AT&T", "Internet service — February", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-03-08", "AT&T", "Internet service — March", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-04-08", "AT&T", "Internet service — April", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-05-08", "AT&T", "Internet service — May", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-06-08", "AT&T", "Internet service — June", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-07-08", "AT&T", "Internet service — July", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-08-08", "AT&T", "Internet service — August", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-09-08", "AT&T", "Internet service — September", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-10-08", "AT&T", "Internet service — October", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-11-08", "AT&T", "Internet service — November", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),
    (1, "2025-12-08", "AT&T", "Internet service — December", "65.00", "expense", "utilities", "line_17_utilities", [], "internet"),

    # ==========================================================================
    # UTILITIES — Downtown Loft (TN — electricity, water, gas, internet)
    # ==========================================================================
    # Electric (Nashville Electric Service)
    (2, "2025-01-11", "Nashville Electric", "Electric bill — January", "100.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-02-11", "Nashville Electric", "Electric bill — February", "95.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-03-11", "Nashville Electric", "Electric bill — March", "90.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-04-11", "Nashville Electric", "Electric bill — April", "105.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-05-11", "Nashville Electric", "Electric bill — May", "125.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-06-11", "Nashville Electric", "Electric bill — June", "160.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-07-11", "Nashville Electric", "Electric bill — July", "180.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-08-11", "Nashville Electric", "Electric bill — August", "175.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-09-11", "Nashville Electric", "Electric bill — September", "140.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-10-11", "Nashville Electric", "Electric bill — October", "108.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-11-11", "Nashville Electric", "Electric bill — November", "98.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    (2, "2025-12-11", "Nashville Electric", "Electric bill — December", "105.00", "expense", "utilities", "line_17_utilities", [], "electricity"),
    # Water (Metro Water Nashville)
    (2, "2025-01-16", "Metro Water Nashville", "Water bill — January", "40.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-02-16", "Metro Water Nashville", "Water bill — February", "38.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-03-16", "Metro Water Nashville", "Water bill — March", "42.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-04-16", "Metro Water Nashville", "Water bill — April", "48.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-05-16", "Metro Water Nashville", "Water bill — May", "55.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-06-16", "Metro Water Nashville", "Water bill — June", "62.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-07-16", "Metro Water Nashville", "Water bill — July", "65.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-08-16", "Metro Water Nashville", "Water bill — August", "60.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-09-16", "Metro Water Nashville", "Water bill — September", "52.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-10-16", "Metro Water Nashville", "Water bill — October", "45.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-11-16", "Metro Water Nashville", "Water bill — November", "40.00", "expense", "utilities", "line_17_utilities", [], "water"),
    (2, "2025-12-16", "Metro Water Nashville", "Water bill — December", "42.00", "expense", "utilities", "line_17_utilities", [], "water"),
    # Gas (Piedmont Natural Gas)
    (2, "2025-01-21", "Piedmont Natural Gas", "Gas bill — January", "52.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-02-21", "Piedmont Natural Gas", "Gas bill — February", "48.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-03-21", "Piedmont Natural Gas", "Gas bill — March", "38.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-04-21", "Piedmont Natural Gas", "Gas bill — April", "32.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-05-21", "Piedmont Natural Gas", "Gas bill — May", "28.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-06-21", "Piedmont Natural Gas", "Gas bill — June", "25.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-07-21", "Piedmont Natural Gas", "Gas bill — July", "22.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-08-21", "Piedmont Natural Gas", "Gas bill — August", "22.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-09-21", "Piedmont Natural Gas", "Gas bill — September", "28.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-10-21", "Piedmont Natural Gas", "Gas bill — October", "35.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-11-21", "Piedmont Natural Gas", "Gas bill — November", "45.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    (2, "2025-12-21", "Piedmont Natural Gas", "Gas bill — December", "50.00", "expense", "utilities", "line_17_utilities", [], "gas"),
    # Internet (Xfinity)
    (2, "2025-01-07", "Xfinity", "Internet service — January", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-02-07", "Xfinity", "Internet service — February", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-03-07", "Xfinity", "Internet service — March", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-04-07", "Xfinity", "Internet service — April", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-05-07", "Xfinity", "Internet service — May", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-06-07", "Xfinity", "Internet service — June", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-07-07", "Xfinity", "Internet service — July", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-08-07", "Xfinity", "Internet service — August", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-09-07", "Xfinity", "Internet service — September", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-10-07", "Xfinity", "Internet service — October", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-11-07", "Xfinity", "Internet service — November", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),
    (2, "2025-12-07", "Xfinity", "Internet service — December", "74.99", "expense", "utilities", "line_17_utilities", [], "internet"),

    # ==========================================================================
    # MORTGAGE INTEREST — monthly per property
    # ==========================================================================
    (0, "2025-01-01", "First National Bank", "Mortgage interest — January", "1050.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-02-01", "First National Bank", "Mortgage interest — February", "1048.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-03-01", "First National Bank", "Mortgage interest — March", "1045.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-04-01", "First National Bank", "Mortgage interest — April", "1042.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-05-01", "First National Bank", "Mortgage interest — May", "1040.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-06-01", "First National Bank", "Mortgage interest — June", "1037.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-07-01", "First National Bank", "Mortgage interest — July", "1035.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-08-01", "First National Bank", "Mortgage interest — August", "1032.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-09-01", "First National Bank", "Mortgage interest — September", "1030.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-10-01", "First National Bank", "Mortgage interest — October", "1027.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-11-01", "First National Bank", "Mortgage interest — November", "1025.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (0, "2025-12-01", "First National Bank", "Mortgage interest — December", "1022.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),

    (1, "2025-01-01", "Wells Fargo", "Mortgage interest — January", "890.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-02-01", "Wells Fargo", "Mortgage interest — February", "888.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-03-01", "Wells Fargo", "Mortgage interest — March", "886.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-04-01", "Wells Fargo", "Mortgage interest — April", "884.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-05-01", "Wells Fargo", "Mortgage interest — May", "882.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-06-01", "Wells Fargo", "Mortgage interest — June", "880.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-07-01", "Wells Fargo", "Mortgage interest — July", "878.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-08-01", "Wells Fargo", "Mortgage interest — August", "876.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-09-01", "Wells Fargo", "Mortgage interest — September", "874.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-10-01", "Wells Fargo", "Mortgage interest — October", "872.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-11-01", "Wells Fargo", "Mortgage interest — November", "870.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (1, "2025-12-01", "Wells Fargo", "Mortgage interest — December", "868.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),

    (2, "2025-01-01", "Bank of America", "Mortgage interest — January", "920.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-02-01", "Bank of America", "Mortgage interest — February", "918.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-03-01", "Bank of America", "Mortgage interest — March", "916.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-04-01", "Bank of America", "Mortgage interest — April", "914.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-05-01", "Bank of America", "Mortgage interest — May", "912.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-06-01", "Bank of America", "Mortgage interest — June", "910.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-07-01", "Bank of America", "Mortgage interest — July", "908.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-08-01", "Bank of America", "Mortgage interest — August", "906.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-09-01", "Bank of America", "Mortgage interest — September", "904.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-10-01", "Bank of America", "Mortgage interest — October", "902.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-11-01", "Bank of America", "Mortgage interest — November", "900.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),
    (2, "2025-12-01", "Bank of America", "Mortgage interest — December", "898.00", "expense", "mortgage_interest", "line_12_mortgage_interest", [], None),

    # ==========================================================================
    # PROPERTY MANAGEMENT FEE — Oak Street Duplex only (monthly)
    # ==========================================================================
    (1, "2025-01-05", "Austin Property Management Co", "Property management fee — January", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-02-05", "Austin Property Management Co", "Property management fee — February", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-03-05", "Austin Property Management Co", "Property management fee — March", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-04-05", "Austin Property Management Co", "Property management fee — April", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-05-05", "Austin Property Management Co", "Property management fee — May", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-06-05", "Austin Property Management Co", "Property management fee — June", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-07-05", "Austin Property Management Co", "Property management fee — July", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-08-05", "Austin Property Management Co", "Property management fee — August", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-09-05", "Austin Property Management Co", "Property management fee — September", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-10-05", "Austin Property Management Co", "Property management fee — October", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-11-05", "Austin Property Management Co", "Property management fee — November", "200.00", "expense", "management_fee", "line_19_other", [], None),
    (1, "2025-12-05", "Austin Property Management Co", "Property management fee — December", "200.00", "expense", "management_fee", "line_19_other", [], None),

    # ==========================================================================
    # INSURANCE — quarterly per property
    # ==========================================================================
    (0, "2025-01-15", "State Farm", "Property insurance — Q1", "450.00", "expense", "insurance", "line_9_insurance", [], None),
    (0, "2025-04-15", "State Farm", "Property insurance — Q2", "450.00", "expense", "insurance", "line_9_insurance", [], None),
    (0, "2025-07-15", "State Farm", "Property insurance — Q3", "450.00", "expense", "insurance", "line_9_insurance", [], None),
    (0, "2025-10-15", "State Farm", "Property insurance — Q4", "450.00", "expense", "insurance", "line_9_insurance", [], None),

    (1, "2025-01-20", "Allstate", "Property insurance — Q1", "420.00", "expense", "insurance", "line_9_insurance", [], None),
    (1, "2025-04-20", "Allstate", "Property insurance — Q2", "420.00", "expense", "insurance", "line_9_insurance", [], None),
    (1, "2025-07-20", "Allstate", "Property insurance — Q3", "420.00", "expense", "insurance", "line_9_insurance", [], None),
    (1, "2025-10-20", "Allstate", "Property insurance — Q4", "420.00", "expense", "insurance", "line_9_insurance", [], None),

    (2, "2025-02-01", "Liberty Mutual", "Property insurance — Q1", "480.00", "expense", "insurance", "line_9_insurance", [], None),
    (2, "2025-05-01", "Liberty Mutual", "Property insurance — Q2", "480.00", "expense", "insurance", "line_9_insurance", [], None),
    (2, "2025-08-01", "Liberty Mutual", "Property insurance — Q3", "480.00", "expense", "insurance", "line_9_insurance", [], None),
    (2, "2025-11-01", "Liberty Mutual", "Property insurance — Q4", "480.00", "expense", "insurance", "line_9_insurance", [], None),

    # ==========================================================================
    # PROPERTY TAXES — semi-annual
    # ==========================================================================
    (0, "2025-04-10", "LA County Tax Collector", "Property tax — first installment", "2800.00", "expense", "taxes", "line_16_taxes", ["tax"], None),
    (0, "2025-12-10", "LA County Tax Collector", "Property tax — second installment", "2800.00", "expense", "taxes", "line_16_taxes", ["tax"], None),
    (1, "2025-01-31", "Travis County Tax Office", "Property tax — annual payment", "4500.00", "expense", "taxes", "line_16_taxes", ["tax"], None),
    (2, "2025-02-28", "Davidson County Trustee", "Property tax — annual payment", "3200.00", "expense", "taxes", "line_16_taxes", ["tax"], None),

    # ==========================================================================
    # MAINTENANCE / REPAIRS
    # ==========================================================================
    (0, "2025-02-14", "Ace Plumbing", "Kitchen sink repair and drain cleaning", "850.00", "expense", "maintenance", "line_14_repairs", [], None),
    (0, "2025-06-20", "LA Pool & Spa Service", "Pool pump repair and filter replacement", "675.00", "expense", "maintenance", "line_14_repairs", [], None),
    (0, "2025-09-08", "Pacific Coast Roofing", "Roof leak repair — master bedroom", "1200.00", "expense", "maintenance", "line_14_repairs", [], None),

    (1, "2025-03-15", "HVAC Solutions", "AC unit annual service and filter change", "280.00", "expense", "maintenance", "line_14_repairs", [], None),
    (1, "2025-06-22", "HVAC Solutions", "AC unit repair and freon recharge", "1200.00", "expense", "maintenance", "line_14_repairs", [], None),
    (1, "2025-08-10", "Lone Star Plumbing", "Bathroom faucet replacement — unit B", "350.00", "expense", "maintenance", "line_14_repairs", [], None),
    (1, "2025-11-05", "Austin Appliance Repair", "Dishwasher repair — unit A", "225.00", "expense", "maintenance", "line_14_repairs", [], None),

    (2, "2025-04-05", "Nashville Handyman Services", "Garbage disposal replacement", "320.00", "expense", "maintenance", "line_14_repairs", [], None),
    (2, "2025-07-18", "Music City Electric", "Electrical outlet repair — living room", "180.00", "expense", "maintenance", "line_14_repairs", [], None),
    (2, "2025-10-25", "Nashville Handyman Services", "Window screen repair and caulking", "150.00", "expense", "maintenance", "line_14_repairs", [], None),

    # ==========================================================================
    # CLEANING — short-term properties (monthly turnover cleaning)
    # ==========================================================================
    (0, "2025-01-20", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-02-22", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-03-25", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-04-20", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-05-22", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-06-25", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-07-20", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-08-22", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-09-25", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-10-20", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-11-22", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (0, "2025-12-20", "SparkleClean Services", "Guest turnover deep clean", "180.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),

    (2, "2025-01-18", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-02-20", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-03-22", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-04-18", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-05-20", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-06-22", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-07-18", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-08-20", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-09-22", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-10-18", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-11-20", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),
    (2, "2025-12-18", "Music City Cleaners", "Guest turnover deep clean", "160.00", "expense", "cleaning_expense", "line_7_cleaning_maintenance", [], None),

    # ==========================================================================
    # CHANNEL FEES — Airbnb host service fees (monthly for short-term)
    # ==========================================================================
    (0, "2025-01-20", "Airbnb Service Fee", "Platform host service fee — January", "54.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-02-20", "Airbnb Service Fee", "Platform host service fee — February", "66.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-03-20", "Airbnb Service Fee", "Platform host service fee — March", "84.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-04-20", "Airbnb Service Fee", "Platform host service fee — April", "96.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-05-20", "Airbnb Service Fee", "Platform host service fee — May", "114.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-06-20", "Airbnb Service Fee", "Platform host service fee — June", "126.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-07-20", "Airbnb Service Fee", "Platform host service fee — July", "123.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-08-20", "Airbnb Service Fee", "Platform host service fee — August", "117.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-09-20", "Airbnb Service Fee", "Platform host service fee — September", "102.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-10-20", "Airbnb Service Fee", "Platform host service fee — October", "78.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-11-20", "Airbnb Service Fee", "Platform host service fee — November", "60.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (0, "2025-12-20", "Airbnb Service Fee", "Platform host service fee — December", "45.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),

    (2, "2025-01-20", "Airbnb Service Fee", "Platform host service fee — January", "36.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-02-20", "Airbnb Service Fee", "Platform host service fee — February", "42.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-03-20", "Airbnb Service Fee", "Platform host service fee — March", "108.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-04-20", "Airbnb Service Fee", "Platform host service fee — April", "66.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-05-20", "Airbnb Service Fee", "Platform host service fee — May", "78.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-06-20", "Airbnb Service Fee", "Platform host service fee — June", "90.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-07-20", "Airbnb Service Fee", "Platform host service fee — July", "84.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-08-20", "Airbnb Service Fee", "Platform host service fee — August", "72.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-09-20", "Airbnb Service Fee", "Platform host service fee — September", "60.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-10-20", "Airbnb Service Fee", "Platform host service fee — October", "54.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-11-20", "Airbnb Service Fee", "Platform host service fee — November", "48.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),
    (2, "2025-12-20", "Airbnb Service Fee", "Platform host service fee — December", "42.00", "expense", "channel_fee", "line_5_advertising", ["airbnb"], None),

    # ==========================================================================
    # FURNISHINGS — one-time purchases
    # ==========================================================================
    (0, "2025-03-12", "Pottery Barn", "Replacement sofa for living room", "1200.00", "expense", "furnishings", "line_19_other", [], None),
    (0, "2025-08-05", "Target", "Guest bedroom linens and towels refresh", "280.00", "expense", "furnishings", "line_19_other", [], None),
    (2, "2025-05-10", "IKEA", "Kitchen table and chairs set", "450.00", "expense", "furnishings", "line_19_other", [], None),
    (2, "2025-09-15", "West Elm", "Accent lighting and decor refresh", "320.00", "expense", "furnishings", "line_19_other", [], None),

    # ==========================================================================
    # ADVERTISING — listing fees and promotions
    # ==========================================================================
    (1, "2025-01-10", "Zillow", "Annual rental listing — Oak Street Duplex", "299.00", "expense", "advertising", "line_5_advertising", [], None),
    (1, "2025-06-15", "Apartments.com", "Featured listing boost — Oak Street Duplex", "149.00", "expense", "advertising", "line_5_advertising", [], None),

    # ==========================================================================
    # TRAVEL — property inspection trips (quarterly)
    # ==========================================================================
    (0, "2025-03-20", "Southwest Airlines", "Round trip flight — LA property inspection", "380.00", "expense", "travel", "line_6_auto_travel", ["travel"], None),
    (0, "2025-09-18", "Southwest Airlines", "Round trip flight — LA property inspection", "420.00", "expense", "travel", "line_6_auto_travel", ["travel"], None),
    (1, "2025-04-12", "Shell Gas Station", "Mileage — Austin property inspection (142 mi)", "48.00", "expense", "travel", "line_6_auto_travel", ["travel"], None),
    (1, "2025-10-08", "Shell Gas Station", "Mileage — Austin property inspection (142 mi)", "52.00", "expense", "travel", "line_6_auto_travel", ["travel"], None),
    (2, "2025-06-05", "Delta Airlines", "Round trip flight — Nashville property inspection", "350.00", "expense", "travel", "line_6_auto_travel", ["travel"], None),
    (2, "2025-12-04", "Delta Airlines", "Round trip flight — Nashville property inspection", "390.00", "expense", "travel", "line_6_auto_travel", ["travel"], None),

    # ==========================================================================
    # LEGAL / PROFESSIONAL — CPA, attorney
    # ==========================================================================
    (1, "2025-02-15", "Thompson & Associates CPA", "Annual tax preparation services", "650.00", "expense", "legal_professional", "line_10_legal_professional", [], None),
    (1, "2025-07-10", "Harris Law Group", "Lease review and tenant consultation", "400.00", "expense", "legal_professional", "line_10_legal_professional", [], None),

    # ==========================================================================
    # CONTRACT WORK — painters, handyman, landscaping
    # ==========================================================================
    (0, "2025-05-15", "Martinez Painting Co", "Exterior touch-up painting", "1800.00", "expense", "contract_work", "line_8_commissions", [], None),
    (1, "2025-09-20", "Green Thumb Landscaping", "Fall landscaping and tree trimming", "550.00", "expense", "contract_work", "line_8_commissions", [], None),
    (2, "2025-03-08", "Nashville Handyman Services", "Bathroom tile repair and re-grout", "420.00", "expense", "contract_work", "line_8_commissions", [], None),

    # ==========================================================================
    # SUPPLIES
    # ==========================================================================
    (0, "2025-04-02", "Home Depot", "Guest amenities and bathroom supplies", "85.00", "expense", "other_expense", "line_19_other", [], None),
    (0, "2025-10-15", "Home Depot", "Smoke detectors and fire extinguisher replacement", "120.00", "expense", "other_expense", "line_19_other", [], None),
    (2, "2025-07-05", "Lowes", "Replacement door locks and hardware", "95.00", "expense", "other_expense", "line_19_other", [], None),
]

# ==========================================================================
# DEMO_DOCUMENTS — groups transactions under source documents
# Each entry: (file_name, document_type, property_index, transaction_match)
# transaction_match is a dict with keys to match against transactions:
#   - vendor: match vendor name (exact)
#   - month: match month number (1-12) in date
#   - category: match category
#   - date: match exact date string
# Multiple matches per document allow grouping (e.g., monthly statement with multiple line items)
# ==========================================================================
DEMO_DOCUMENTS: list[dict] = [
    # Airbnb monthly payout statements — one per month per property
    *[
        {
            "file_name": f"airbnb-payout-statement-{month_name.lower()}-2025-sunset-villa.pdf",
            "document_type": "payout_statement",
            "property_index": 0,
            "match": {"vendor": "Airbnb", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"airbnb-payout-statement-{month_name.lower()}-2025-downtown-loft.pdf",
            "document_type": "payout_statement",
            "property_index": 2,
            "match": {"vendor": "Airbnb", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    # Tenant rent receipts — monthly
    *[
        {
            "file_name": f"rent-receipt-{month_name.lower()}-2025-oak-street.pdf",
            "document_type": "rent_receipt",
            "property_index": 1,
            "match": {"vendor": "Tenant - Sarah Johnson", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    # Utility bills — one per month per utility per property
    # Sunset Villa
    *[
        {
            "file_name": f"socal-edison-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 0,
            "match": {"vendor": "SoCal Edison", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"ladwp-water-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 0,
            "match": {"vendor": "LADWP", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"socalgas-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 0,
            "match": {"vendor": "SoCalGas", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"spectrum-internet-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 0,
            "match": {"vendor": "Spectrum", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    # Oak Street Duplex
    *[
        {
            "file_name": f"austin-energy-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 1,
            "match": {"vendor": "Austin Energy", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"austin-water-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 1,
            "match": {"vendor": "Austin Water", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"texas-gas-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 1,
            "match": {"vendor": "Texas Gas Service", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"att-internet-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 1,
            "match": {"vendor": "AT&T", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    # Downtown Loft
    *[
        {
            "file_name": f"nashville-electric-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 2,
            "match": {"vendor": "Nashville Electric", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"metro-water-nashville-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 2,
            "match": {"vendor": "Metro Water Nashville", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"piedmont-gas-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 2,
            "match": {"vendor": "Piedmont Natural Gas", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"xfinity-internet-{month_name.lower()}-2025.pdf",
            "document_type": "utility_bill",
            "property_index": 2,
            "match": {"vendor": "Xfinity", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    # Mortgage statements — one per month per property
    *[
        {
            "file_name": f"first-national-bank-mortgage-{month_name.lower()}-2025.pdf",
            "document_type": "mortgage_statement",
            "property_index": 0,
            "match": {"vendor": "First National Bank", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"wells-fargo-mortgage-{month_name.lower()}-2025.pdf",
            "document_type": "mortgage_statement",
            "property_index": 1,
            "match": {"vendor": "Wells Fargo", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"bofa-mortgage-{month_name.lower()}-2025.pdf",
            "document_type": "mortgage_statement",
            "property_index": 2,
            "match": {"vendor": "Bank of America", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    # Property management invoices
    *[
        {
            "file_name": f"austin-pm-invoice-{month_name.lower()}-2025.pdf",
            "document_type": "invoice",
            "property_index": 1,
            "match": {"vendor": "Austin Property Management Co", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    # Insurance — quarterly
    {"file_name": "state-farm-insurance-q1-2025.pdf", "document_type": "insurance_statement", "property_index": 0, "match": {"vendor": "State Farm", "date": "2025-01-15"}},
    {"file_name": "state-farm-insurance-q2-2025.pdf", "document_type": "insurance_statement", "property_index": 0, "match": {"vendor": "State Farm", "date": "2025-04-15"}},
    {"file_name": "state-farm-insurance-q3-2025.pdf", "document_type": "insurance_statement", "property_index": 0, "match": {"vendor": "State Farm", "date": "2025-07-15"}},
    {"file_name": "state-farm-insurance-q4-2025.pdf", "document_type": "insurance_statement", "property_index": 0, "match": {"vendor": "State Farm", "date": "2025-10-15"}},
    {"file_name": "allstate-insurance-q1-2025.pdf", "document_type": "insurance_statement", "property_index": 1, "match": {"vendor": "Allstate", "date": "2025-01-20"}},
    {"file_name": "allstate-insurance-q2-2025.pdf", "document_type": "insurance_statement", "property_index": 1, "match": {"vendor": "Allstate", "date": "2025-04-20"}},
    {"file_name": "allstate-insurance-q3-2025.pdf", "document_type": "insurance_statement", "property_index": 1, "match": {"vendor": "Allstate", "date": "2025-07-20"}},
    {"file_name": "allstate-insurance-q4-2025.pdf", "document_type": "insurance_statement", "property_index": 1, "match": {"vendor": "Allstate", "date": "2025-10-20"}},
    {"file_name": "liberty-mutual-insurance-q1-2025.pdf", "document_type": "insurance_statement", "property_index": 2, "match": {"vendor": "Liberty Mutual", "date": "2025-02-01"}},
    {"file_name": "liberty-mutual-insurance-q2-2025.pdf", "document_type": "insurance_statement", "property_index": 2, "match": {"vendor": "Liberty Mutual", "date": "2025-05-01"}},
    {"file_name": "liberty-mutual-insurance-q3-2025.pdf", "document_type": "insurance_statement", "property_index": 2, "match": {"vendor": "Liberty Mutual", "date": "2025-08-01"}},
    {"file_name": "liberty-mutual-insurance-q4-2025.pdf", "document_type": "insurance_statement", "property_index": 2, "match": {"vendor": "Liberty Mutual", "date": "2025-11-01"}},
    # Property taxes
    {"file_name": "la-county-property-tax-installment-1-2025.pdf", "document_type": "tax_document", "property_index": 0, "match": {"vendor": "LA County Tax Collector", "date": "2025-04-10"}},
    {"file_name": "la-county-property-tax-installment-2-2025.pdf", "document_type": "tax_document", "property_index": 0, "match": {"vendor": "LA County Tax Collector", "date": "2025-12-10"}},
    {"file_name": "travis-county-property-tax-2025.pdf", "document_type": "tax_document", "property_index": 1, "match": {"vendor": "Travis County Tax Office", "date": "2025-01-31"}},
    {"file_name": "davidson-county-property-tax-2025.pdf", "document_type": "tax_document", "property_index": 2, "match": {"vendor": "Davidson County Trustee", "date": "2025-02-28"}},
    # Maintenance/repair invoices
    {"file_name": "ace-plumbing-invoice-feb-2025.pdf", "document_type": "invoice", "property_index": 0, "match": {"vendor": "Ace Plumbing", "date": "2025-02-14"}},
    {"file_name": "la-pool-spa-invoice-jun-2025.pdf", "document_type": "invoice", "property_index": 0, "match": {"vendor": "LA Pool & Spa Service", "date": "2025-06-20"}},
    {"file_name": "pacific-coast-roofing-invoice-sep-2025.pdf", "document_type": "invoice", "property_index": 0, "match": {"vendor": "Pacific Coast Roofing", "date": "2025-09-08"}},
    {"file_name": "hvac-solutions-service-mar-2025.pdf", "document_type": "invoice", "property_index": 1, "match": {"vendor": "HVAC Solutions", "date": "2025-03-15"}},
    {"file_name": "hvac-solutions-repair-jun-2025.pdf", "document_type": "invoice", "property_index": 1, "match": {"vendor": "HVAC Solutions", "date": "2025-06-22"}},
    {"file_name": "lone-star-plumbing-invoice-aug-2025.pdf", "document_type": "invoice", "property_index": 1, "match": {"vendor": "Lone Star Plumbing", "date": "2025-08-10"}},
    {"file_name": "austin-appliance-repair-nov-2025.pdf", "document_type": "invoice", "property_index": 1, "match": {"vendor": "Austin Appliance Repair", "date": "2025-11-05"}},
    {"file_name": "nashville-handyman-invoice-apr-2025.pdf", "document_type": "invoice", "property_index": 2, "match": {"vendor": "Nashville Handyman Services", "date": "2025-04-05"}},
    {"file_name": "music-city-electric-invoice-jul-2025.pdf", "document_type": "invoice", "property_index": 2, "match": {"vendor": "Music City Electric", "date": "2025-07-18"}},
    {"file_name": "nashville-handyman-invoice-oct-2025.pdf", "document_type": "invoice", "property_index": 2, "match": {"vendor": "Nashville Handyman Services", "date": "2025-10-25"}},
    # Cleaning invoices — monthly (one per property per month)
    *[
        {
            "file_name": f"sparkleclean-invoice-{month_name.lower()}-2025.pdf",
            "document_type": "invoice",
            "property_index": 0,
            "match": {"vendor": "SparkleClean Services", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"music-city-cleaners-invoice-{month_name.lower()}-2025.pdf",
            "document_type": "invoice",
            "property_index": 2,
            "match": {"vendor": "Music City Cleaners", "month": month_num},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    # Channel fee invoices — monthly per property
    *[
        {
            "file_name": f"airbnb-host-fee-{month_name.lower()}-2025-sunset-villa.pdf",
            "document_type": "invoice",
            "property_index": 0,
            "match": {"vendor": "Airbnb Service Fee", "month": month_num, "property_index": 0},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    *[
        {
            "file_name": f"airbnb-host-fee-{month_name.lower()}-2025-downtown-loft.pdf",
            "document_type": "invoice",
            "property_index": 2,
            "match": {"vendor": "Airbnb Service Fee", "month": month_num, "property_index": 2},
        }
        for month_num, month_name in enumerate(
            ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1
        )
    ],
    # Furnishings
    {"file_name": "pottery-barn-receipt-mar-2025.pdf", "document_type": "receipt", "property_index": 0, "match": {"vendor": "Pottery Barn", "date": "2025-03-12"}},
    {"file_name": "target-receipt-aug-2025.pdf", "document_type": "receipt", "property_index": 0, "match": {"vendor": "Target", "date": "2025-08-05"}},
    {"file_name": "ikea-receipt-may-2025.pdf", "document_type": "receipt", "property_index": 2, "match": {"vendor": "IKEA", "date": "2025-05-10"}},
    {"file_name": "west-elm-receipt-sep-2025.pdf", "document_type": "receipt", "property_index": 2, "match": {"vendor": "West Elm", "date": "2025-09-15"}},
    # Advertising
    {"file_name": "zillow-listing-invoice-jan-2025.pdf", "document_type": "invoice", "property_index": 1, "match": {"vendor": "Zillow", "date": "2025-01-10"}},
    {"file_name": "apartments-com-invoice-jun-2025.pdf", "document_type": "invoice", "property_index": 1, "match": {"vendor": "Apartments.com", "date": "2025-06-15"}},
    # Travel
    {"file_name": "southwest-airlines-receipt-mar-2025.pdf", "document_type": "receipt", "property_index": 0, "match": {"vendor": "Southwest Airlines", "date": "2025-03-20"}},
    {"file_name": "southwest-airlines-receipt-sep-2025.pdf", "document_type": "receipt", "property_index": 0, "match": {"vendor": "Southwest Airlines", "date": "2025-09-18"}},
    {"file_name": "shell-gas-receipt-apr-2025.pdf", "document_type": "receipt", "property_index": 1, "match": {"vendor": "Shell Gas Station", "date": "2025-04-12"}},
    {"file_name": "shell-gas-receipt-oct-2025.pdf", "document_type": "receipt", "property_index": 1, "match": {"vendor": "Shell Gas Station", "date": "2025-10-08"}},
    {"file_name": "delta-airlines-receipt-jun-2025.pdf", "document_type": "receipt", "property_index": 2, "match": {"vendor": "Delta Airlines", "date": "2025-06-05"}},
    {"file_name": "delta-airlines-receipt-dec-2025.pdf", "document_type": "receipt", "property_index": 2, "match": {"vendor": "Delta Airlines", "date": "2025-12-04"}},
    # Legal / Professional
    {"file_name": "thompson-cpa-invoice-feb-2025.pdf", "document_type": "invoice", "property_index": 1, "match": {"vendor": "Thompson & Associates CPA", "date": "2025-02-15"}},
    {"file_name": "harris-law-invoice-jul-2025.pdf", "document_type": "invoice", "property_index": 1, "match": {"vendor": "Harris Law Group", "date": "2025-07-10"}},
    # Contract work
    {"file_name": "martinez-painting-invoice-may-2025.pdf", "document_type": "invoice", "property_index": 0, "match": {"vendor": "Martinez Painting Co", "date": "2025-05-15"}},
    {"file_name": "green-thumb-landscaping-invoice-sep-2025.pdf", "document_type": "invoice", "property_index": 1, "match": {"vendor": "Green Thumb Landscaping", "date": "2025-09-20"}},
    {"file_name": "nashville-handyman-tile-invoice-mar-2025.pdf", "document_type": "invoice", "property_index": 2, "match": {"vendor": "Nashville Handyman Services", "date": "2025-03-08"}},
    # Supplies
    {"file_name": "home-depot-receipt-apr-2025.pdf", "document_type": "receipt", "property_index": 0, "match": {"vendor": "Home Depot", "date": "2025-04-02"}},
    {"file_name": "home-depot-receipt-oct-2025.pdf", "document_type": "receipt", "property_index": 0, "match": {"vendor": "Home Depot", "date": "2025-10-15"}},
    {"file_name": "lowes-receipt-jul-2025.pdf", "document_type": "receipt", "property_index": 2, "match": {"vendor": "Lowes", "date": "2025-07-05"}},
]

# ==========================================================================
# DEMO_TAX_DOCUMENTS — actual PDF tax docs generated at seed time
# property_index=None means org-level (not tied to a specific property)
# ==========================================================================
DEMO_TAX_DOCUMENTS: list[dict] = [
    {
        "file_name": "1099-K-airbnb-sunset-villa-2025.pdf",
        "document_type": "1099_k",
        "property_index": 0,
        "description": "1099-K from Airbnb — Sunset Villa rental income",
        "tags": ["tax", "2025", "1099-k"],
        "pdf_data": {
            "form_type": "1099-K",
            "issuer_name": "Airbnb, Inc.",
            "issuer_address": "888 Brannan St, San Francisco, CA 94103",
            "issuer_tin": "26-3544540",
            "recipient_name": "Demo User",
            "recipient_address": "1234 Sunset Blvd, Los Angeles, CA 90028",
            "recipient_tin": "***-**-1234",
            "gross_amount": "35,500.00",
            "tax_year": "2025",
        },
    },
    {
        "file_name": "1099-MISC-property-manager-oak-street-2025.pdf",
        "document_type": "1099_misc",
        "property_index": 1,
        "description": "1099-MISC from Austin Property Management — rent collected",
        "tags": ["tax", "2025", "1099-misc"],
        "pdf_data": {
            "form_type": "1099-MISC",
            "issuer_name": "Austin Property Management Co",
            "issuer_address": "200 Congress Ave, Austin, TX 78701",
            "issuer_tin": "74-3218765",
            "recipient_name": "Demo User",
            "recipient_address": "567 Oak St, Austin, TX 78701",
            "recipient_tin": "***-**-1234",
            "rents_amount": "28,800.00",
            "tax_year": "2025",
        },
    },
    {
        "file_name": "1098-mortgage-interest-first-national-2025.pdf",
        "document_type": "1098",
        "property_index": 0,
        "description": "1098 Mortgage Interest Statement — First National Bank",
        "tags": ["tax", "2025", "1098"],
        "pdf_data": {
            "form_type": "1098",
            "lender_name": "First National Bank",
            "lender_address": "500 Main St, Los Angeles, CA 90012",
            "lender_tin": "95-1234567",
            "borrower_name": "Demo User",
            "borrower_address": "1234 Sunset Blvd, Los Angeles, CA 90028",
            "borrower_tin": "***-**-1234",
            "mortgage_interest": "12,433.00",
            "tax_year": "2025",
        },
    },
    {
        "file_name": "property-tax-statement-travis-county-2025.pdf",
        "document_type": "tax_document",
        "property_index": 1,
        "description": "Property Tax Statement — Travis County, TX",
        "tags": ["tax", "2025", "property-tax"],
        "pdf_data": {
            "form_type": "Property Tax Statement",
            "authority_name": "Travis County Tax Office",
            "authority_address": "5501 Airport Blvd, Austin, TX 78751",
            "property_address": "567 Oak St, Austin, TX 78701",
            "owner_name": "Demo User",
            "tax_year": "2025",
            "assessed_value": "285,000.00",
            "tax_amount": "4,500.00",
        },
    },
    {
        "file_name": "insurance-declaration-state-farm-2025.pdf",
        "document_type": "insurance_statement",
        "property_index": 0,
        "description": "Insurance Declaration Page — State Farm",
        "tags": ["tax", "2025", "insurance"],
        "pdf_data": {
            "form_type": "Insurance Declaration",
            "insurer_name": "State Farm Insurance",
            "insurer_address": "One State Farm Plaza, Bloomington, IL 61710",
            "policy_number": "SF-98-7654-321",
            "insured_name": "Demo User",
            "property_address": "1234 Sunset Blvd, Los Angeles, CA 90028",
            "coverage_period": "01/01/2025 - 12/31/2025",
            "annual_premium": "1,800.00",
            "dwelling_coverage": "450,000.00",
        },
    },
    {
        "file_name": "w2-lone-star-technologies-2025.pdf",
        "document_type": "w2",
        "property_index": None,
        "description": "W-2 Wage and Tax Statement — Lone Star Technologies LLC",
        "tags": ["tax", "2025", "w-2"],
        "pdf_data": {
            "form_type": "W-2",
            "employer_name": "Lone Star Technologies LLC",
            "employer_address": "2200 W Parmer Ln, Suite 400, Austin, TX 78727",
            "employer_ein": "74-3219876",
            "employee_name": "Demo User",
            "employee_address": "1234 Sunset Blvd, Los Angeles, CA 90028",
            "employee_ssn": "***-**-1234",
            "wages": "85,000.00",
            "federal_tax_withheld": "14,875.00",
            "ss_wages": "85,000.00",
            "ss_tax": "5,270.00",
            "medicare_wages": "85,000.00",
            "medicare_tax": "1,232.50",
            "state": "TX",
            "state_wages": "",
            "state_tax": "",
            "employer_state_id": "",
            "box_12a": "DD  4,200.00",
            "tax_year": "2025",
        },
    },
]
