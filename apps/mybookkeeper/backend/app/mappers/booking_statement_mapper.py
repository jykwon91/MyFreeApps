"""BookingStatement mapper — single source of truth for building BookingStatement models from raw data.

The input dicts come from Claude extraction of PM (property manager) statements,
where each line item describes a single reservation row (booking) on the
statement. The mapper normalizes those rows into BookingStatement ORM rows.
"""
import uuid

from app.core.parsers import safe_date, safe_decimal
from app.models.transactions.booking_statement import BookingStatement


def build_booking_statement_from_line_item(
    li: dict,
    organization_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
    transaction_id: uuid.UUID | None = None,
) -> BookingStatement | None:
    """Build a BookingStatement from a single line_item dict. Returns None if required fields are missing."""
    res_code = li.get("res_code")
    check_in = safe_date(li.get("check_in"))
    check_out = safe_date(li.get("check_out"))
    if not res_code or not check_in or not check_out:
        return None

    check_in_d = check_in.date() if hasattr(check_in, "date") else check_in
    check_out_d = check_out.date() if hasattr(check_out, "date") else check_out
    if check_out_d <= check_in_d:
        return None

    raw_platform = li.get("channel") or li.get("platform")
    platform = raw_platform.lower() if isinstance(raw_platform, str) else raw_platform
    net_booking_revenue = safe_decimal(li.get("net_booking_revenue"))
    commission = safe_decimal(li.get("commission"))
    gross_booking = safe_decimal(li.get("gross_booking") or li.get("booking_revenue"))
    if not gross_booking and net_booking_revenue:
        gross_booking = net_booking_revenue + (commission or 0)

    # DB constraint: platform IS NULL OR gross_booking IS NOT NULL
    # If we can't determine gross_booking, clear platform to avoid violation
    if platform and not gross_booking:
        platform = None

    return BookingStatement(
        organization_id=organization_id,
        property_id=property_id,
        transaction_id=transaction_id,
        res_code=res_code,
        platform=platform,
        check_in=check_in_d,
        check_out=check_out_d,
        gross_booking=gross_booking,
        net_booking_revenue=net_booking_revenue,
        commission=commission,
        cleaning_fee=safe_decimal(li.get("cleaning_fee") or li.get("cleaning")),
        insurance_fee=safe_decimal(li.get("insurance_fee") or li.get("insurance")),
        net_client_earnings=safe_decimal(li.get("net_client_earnings")),
        funds_due_to_client=safe_decimal(li.get("funds_due_to_client")),
        guest_name=li.get("guest_name"),
    )


def build_booking_statements_from_line_items(
    line_items: list[dict] | None,
    organization_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
    transaction_id: uuid.UUID | None = None,
) -> list[BookingStatement]:
    """Build BookingStatement rows from line_items that have res_code + check_in + check_out."""
    if not line_items:
        return []
    booking_statements: list[BookingStatement] = []
    for li in line_items:
        if not isinstance(li, dict):
            continue
        bs = build_booking_statement_from_line_item(li, organization_id, property_id, transaction_id)
        if bs:
            booking_statements.append(bs)
    return booking_statements
