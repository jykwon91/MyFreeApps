"""Pure period / display-name helpers for rent receipts.

Extracted from ``receipt_service`` (file-size no-growth policy); the service
re-imports these under their original private names.
"""
from __future__ import annotations

import datetime as _dt
from calendar import monthrange


def default_period(txn_date: _dt.date) -> tuple[_dt.date, _dt.date]:
    """Return (start, end) for the full calendar month of ``txn_date``."""
    first = txn_date.replace(day=1)
    last_day = monthrange(txn_date.year, txn_date.month)[1]
    last = txn_date.replace(day=last_day)
    return first, last


def clamp_period_to_term(
    start: _dt.date,
    end: _dt.date,
    *,
    term_start: _dt.date | None,
    term_end: _dt.date | None,
) -> tuple[_dt.date, _dt.date]:
    """Clip a candidate receipt period to the tenant's occupancy window.

    A receipt must never claim coverage for days the tenant was not under
    lease. Without this, a payment recorded in a move-out month defaults to
    the whole calendar month and the PDF overstates the period — e.g. a
    tenant whose term ended Aug 9 gets a receipt reading "Aug 1–31".

    Lease terms are inclusive on both ends, so a term running 05-03 → 11-10
    covers both of those days. Either bound may be ``None`` (open-ended
    leases exist in the data); an absent bound simply does not clip.

    Returns the period unchanged when the term and the period do not overlap
    at all. A payment dated outside the lease window is a data question for
    the host to resolve in the dialog, not something to silently rewrite
    into an inverted or zero-day range.
    """
    clamped_start = max(start, term_start) if term_start is not None else start
    clamped_end = min(end, term_end) if term_end is not None else end
    if clamped_start > clamped_end:
        return start, end
    return clamped_start, clamped_end


def resolve_landlord_name(host_user) -> str:  # type: ignore[no-untyped-def]
    """Pick the landlord display name for the receipt.

    Prefers the host's configured ``user.name`` (legal name they entered
    at registration or in profile settings). Falls back to the email
    local-part only when the user hasn't set a name yet — that fallback
    surfaces strings like 'jasonykwon91' on the receipt, which is wrong
    for tenant-facing artifacts. The UI nudges the user to set their
    name on the Security page so the fallback is short-lived.
    """
    name = (host_user.name or "").strip() if hasattr(host_user, "name") else ""
    if name:
        return name
    if host_user.email:
        return host_user.email.split("@")[0]
    return "Landlord"


def format_period_short(start: _dt.date, end: _dt.date) -> str:
    if start.year == end.year and start.month == end.month:
        return start.strftime("%b %Y")
    return f"{start.strftime('%b %Y')} – {end.strftime('%b %Y')}"


def format_period_long(start: _dt.date, end: _dt.date) -> str:
    if start.year == end.year and start.month == end.month:
        last = monthrange(start.year, start.month)[1]
        return f"{start.strftime('%B')} {start.day}–{last}, {start.year}"
    return f"{start.strftime('%B %-d, %Y')} – {end.strftime('%B %-d, %Y')}"
