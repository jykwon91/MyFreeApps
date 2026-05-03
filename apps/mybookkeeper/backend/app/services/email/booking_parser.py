"""Booking email parser — detect and extract reservation confirmations.

Parses booking confirmation emails from Airbnb, Furnished Finder,
Booking.com, and Vrbo and returns a structured ``BookingParseResult``.

The parser is intentionally conservative:
  - Pattern matching is channel-specific (not generic).
  - If any required field can't be extracted, the result is marked
    ``is_booking=False`` so the caller treats the email as non-actionable.
  - No raw email text is returned; only structured fields are extracted.
    This is mandated by the privacy note in the saved design: "Don't
    persist full email bodies — only Claude-extracted fields."

Supported channels and detection heuristics:

  airbnb:
    - From: automated@airbnb.com / support@airbnb.com
    - Subject contains "reservation confirmed" or "new reservation"
    - Listing ID extracted from "#<digits>" pattern

  furnished_finder:
    - From: *@furnishedfinder.com
    - Subject contains "booking request" or "new booking"
    - Listing ID extracted from "#FF-<digits>" or "(#<digits>)" pattern

  booking_com:
    - From: *@booking.com
    - Subject contains "new booking"
    - Property ID extracted from "Property ID: BDC-<digits>" pattern

  vrbo:
    - From: *@vrbo.com / *@homeaway.com
    - Subject contains "booking request" or "reservation"
    - Listing ID extracted from "#VRBO-<digits>" or "Listing #" pattern
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

# ---------------------------------------------------------------------------
# Channel detection — from-address and subject matchers
# ---------------------------------------------------------------------------

_AIRBNB_FROM_PATTERN = re.compile(
    r"@airbnb\.com", re.IGNORECASE,
)
_AIRBNB_SUBJECT_KEYWORDS = frozenset({
    "reservation confirmed",
    "new reservation",
    "you have a new reservation",
})

_FF_FROM_PATTERN = re.compile(
    r"@furnishedfinder\.com", re.IGNORECASE,
)
_FF_SUBJECT_KEYWORDS = frozenset({
    "booking request",
    "new booking",
    "booking confirmed",
})

_BOOKING_COM_FROM_PATTERN = re.compile(
    r"@booking\.com", re.IGNORECASE,
)
_BOOKING_COM_SUBJECT_KEYWORDS = frozenset({
    "new booking",
    "booking confirmation",
})

_VRBO_FROM_PATTERN = re.compile(
    r"@(vrbo|homeaway)\.com", re.IGNORECASE,
)
_VRBO_SUBJECT_KEYWORDS = frozenset({
    "booking request",
    "reservation",
    "booking inquiry",
})

# ---------------------------------------------------------------------------
# Date extraction — common date patterns across channels
# ---------------------------------------------------------------------------

# Month name → zero-padded number
_MONTHS = {
    "january": "01", "february": "02", "march": "03", "april": "04",
    "may": "05", "june": "06", "july": "07", "august": "08",
    "september": "09", "october": "10", "november": "11", "december": "12",
    "jan": "01", "feb": "02", "mar": "03", "apr": "04",
    "jun": "06", "jul": "07", "aug": "08", "sep": "09", "oct": "10",
    "nov": "11", "dec": "12",
}

# Patterns for dates like "June 5, 2026", "5 August 2026", "Aug 12, 2026"
_DATE_WRITTEN_1 = re.compile(
    r"(\w+)\s+(\d{1,2}),?\s+(\d{4})",  # "June 5, 2026" or "June 5 2026"
)
_DATE_WRITTEN_2 = re.compile(
    r"(\d{1,2})\s+(\w+)\s+(\d{4})",  # "5 August 2026"
)
# Abbreviated month-day e.g. "Jun 5" (no year — fall back to next occurrence)
_DATE_ABBREV_NO_YEAR = re.compile(
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})",
    re.IGNORECASE,
)

# Airbnb subject shorthand: "Jun 5 - Jun 10"
_DATE_RANGE_SHORT = re.compile(
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})"
    r"\s*[-–]\s*"
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})",
    re.IGNORECASE,
)


def _parse_written_date(text: str) -> date | None:
    """Try to extract a date from a written-English date string."""
    for m in _DATE_WRITTEN_1.finditer(text):
        month_name, day, year = m.group(1), m.group(2), m.group(3)
        month = _MONTHS.get(month_name.lower())
        if month:
            try:
                return date(int(year), int(month), int(day))
            except ValueError:
                pass
    for m in _DATE_WRITTEN_2.finditer(text):
        day, month_name, year = m.group(1), m.group(2), m.group(3)
        month = _MONTHS.get(month_name.lower())
        if month:
            try:
                return date(int(year), int(month), int(day))
            except ValueError:
                pass
    return None


# ---------------------------------------------------------------------------
# Price extraction
# ---------------------------------------------------------------------------

_PRICE_PATTERN = re.compile(
    r"\$\s*([\d,]+(?:\.\d{2})?)",
)


def _extract_price(text: str) -> str | None:
    m = _PRICE_PATTERN.search(text)
    return m.group(0) if m else None


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------


@dataclass
class BookingParseResult:
    """Structured result from parsing a candidate booking email."""

    is_booking: bool
    """True if this email looks like a host-facing booking confirmation."""

    source_channel: str | None = None
    """Detected channel slug (airbnb / furnished_finder / booking_com / vrbo)."""

    source_listing_id: str | None = None
    """External listing identifier as used by the channel in this email."""

    guest_name: str | None = None
    check_in: date | None = None
    check_out: date | None = None
    total_price: str | None = None
    raw_subject: str = ""

    extra: dict = field(default_factory=dict)
    """Any additional parsed fields (booking reference, etc.)."""

    def to_payload(self) -> dict:
        """Serialise to the JSONB payload stored in the review-queue row."""
        return {
            "source_channel": self.source_channel,
            "source_listing_id": self.source_listing_id,
            "guest_name": self.guest_name,
            "check_in": self.check_in.isoformat() if self.check_in else None,
            "check_out": self.check_out.isoformat() if self.check_out else None,
            "total_price": self.total_price,
            "raw_subject": self.raw_subject,
            **self.extra,
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_booking_email(
    *,
    from_address: str | None,
    subject: str,
    body: str,
) -> BookingParseResult:
    """Parse a candidate booking email and return a ``BookingParseResult``.

    The caller should pass the raw ``subject`` and ``body`` text. The result
    ``is_booking`` field indicates whether this looks like a host-side
    reservation confirmation; if ``False``, the email should be left to the
    existing invoice-extraction pipeline.

    No external calls are made — this is pure text analysis.
    """
    from_str = from_address or ""
    combined = f"{subject}\n{body}"

    channel = _detect_channel(from_str, subject)
    if channel is None:
        return BookingParseResult(is_booking=False, raw_subject=subject)

    result = _parse_for_channel(channel, subject=subject, body=combined)
    result.raw_subject = subject
    return result


# ---------------------------------------------------------------------------
# Channel detection
# ---------------------------------------------------------------------------


def _detect_channel(from_address: str, subject: str) -> str | None:
    subject_lower = subject.lower()

    if _AIRBNB_FROM_PATTERN.search(from_address):
        if any(kw in subject_lower for kw in _AIRBNB_SUBJECT_KEYWORDS):
            return "airbnb"

    if _FF_FROM_PATTERN.search(from_address):
        if any(kw in subject_lower for kw in _FF_SUBJECT_KEYWORDS):
            return "furnished_finder"

    if _BOOKING_COM_FROM_PATTERN.search(from_address):
        if any(kw in subject_lower for kw in _BOOKING_COM_SUBJECT_KEYWORDS):
            return "booking_com"

    if _VRBO_FROM_PATTERN.search(from_address):
        if any(kw in subject_lower for kw in _VRBO_SUBJECT_KEYWORDS):
            return "vrbo"

    return None


# ---------------------------------------------------------------------------
# Per-channel parsers
# ---------------------------------------------------------------------------


def _parse_for_channel(
    channel: str, *, subject: str, body: str,
) -> BookingParseResult:
    parsers = {
        "airbnb": _parse_airbnb,
        "furnished_finder": _parse_furnished_finder,
        "booking_com": _parse_booking_com,
        "vrbo": _parse_vrbo,
    }
    parser = parsers.get(channel)
    if parser is None:
        return BookingParseResult(is_booking=False)
    return parser(subject=subject, body=body)


def _parse_airbnb(*, subject: str, body: str) -> BookingParseResult:
    """Parse an Airbnb host-facing reservation confirmation."""
    # Listing ID: "#12345678"
    listing_match = re.search(r"#(\d{6,12})", body)
    source_listing_id = listing_match.group(1) if listing_match else None

    # Guest name: "Guest: <name>" line
    guest_match = re.search(r"Guest:\s*(.+)", body)
    guest_name = guest_match.group(1).strip() if guest_match else None

    # Dates from body
    check_in = _extract_date_after_label(body, ("check-in:", "check in:"))
    check_out = _extract_date_after_label(body, ("check-out:", "checkout:", "check out:"))

    # Fallback: date range from subject "Jun 5 - Jun 10"
    if check_in is None and check_out is None:
        check_in, check_out = _extract_date_range_from_subject(subject)

    total_price = _extract_price_after_label(
        body, ("total payout:", "payout:", "total:"),
    )

    # Booking reference
    ref_match = re.search(r"reservation code:\s*(\S+)", body, re.IGNORECASE)
    extra: dict = {}
    if ref_match:
        extra["booking_reference"] = ref_match.group(1)

    return BookingParseResult(
        is_booking=True,
        source_channel="airbnb",
        source_listing_id=source_listing_id,
        guest_name=guest_name,
        check_in=check_in,
        check_out=check_out,
        total_price=total_price,
        extra=extra,
    )


def _parse_furnished_finder(*, subject: str, body: str) -> BookingParseResult:
    """Parse a Furnished Finder host-facing booking notification."""
    # Listing ID: "#FF-789012" or "(#12345)"
    listing_match = re.search(r"#(?:FF-)?(\w{4,12})", body, re.IGNORECASE)
    source_listing_id = listing_match.group(1) if listing_match else None

    guest_match = re.search(r"Tenant:\s*(.+)", body)
    guest_name = guest_match.group(1).strip() if guest_match else None

    check_in = _extract_date_after_label(body, ("move-in:", "check-in:", "arrival:"))
    check_out = _extract_date_after_label(body, ("move-out:", "check-out:", "departure:"))

    total_price = _extract_price_after_label(
        body, ("monthly rent:", "rent:", "total:"),
    )

    return BookingParseResult(
        is_booking=True,
        source_channel="furnished_finder",
        source_listing_id=source_listing_id,
        guest_name=guest_name,
        check_in=check_in,
        check_out=check_out,
        total_price=total_price,
    )


def _parse_booking_com(*, subject: str, body: str) -> BookingParseResult:
    """Parse a Booking.com host-facing booking notification."""
    # Property ID: "Property ID: BDC-456789" or "BDC-<digits>"
    listing_match = re.search(r"Property ID:\s*(?:BDC-)?(\w{4,15})", body, re.IGNORECASE)
    source_listing_id = listing_match.group(1) if listing_match else None

    guest_match = re.search(r"Guest name:\s*(.+)", body)
    guest_name = guest_match.group(1).strip() if guest_match else None

    check_in = _extract_date_after_label(body, ("arrival:", "check-in:", "check in:"))
    check_out = _extract_date_after_label(body, ("departure:", "check-out:", "checkout:"))

    total_price = _extract_price_after_label(
        body, ("total amount:", "amount:", "total:"),
    )

    ref_match = re.search(r"Booking reference:\s*(\S+)", body, re.IGNORECASE)
    extra: dict = {}
    if ref_match:
        extra["booking_reference"] = ref_match.group(1)

    return BookingParseResult(
        is_booking=True,
        source_channel="booking_com",
        source_listing_id=source_listing_id,
        guest_name=guest_name,
        check_in=check_in,
        check_out=check_out,
        total_price=total_price,
        extra=extra,
    )


def _parse_vrbo(*, subject: str, body: str) -> BookingParseResult:
    """Parse a Vrbo host-facing booking notification."""
    # Listing ID: "Listing #VRBO-321654" — capture the digits after the last dash
    # or fallback to a bare numeric ID after "Listing #".
    listing_match = re.search(
        r"Listing #(?:VRBO-)?(\w{4,12})", body, re.IGNORECASE,
    )
    source_listing_id = listing_match.group(1) if listing_match else None

    guest_match = re.search(r"Guest:\s*(.+)", body)
    guest_name = guest_match.group(1).strip() if guest_match else None

    check_in = _extract_date_after_label(
        body, ("check-in:", "arrival:", "check in:"),
    )
    check_out = _extract_date_after_label(
        body, ("checkout:", "check-out:", "departure:"),
    )

    total_price = _extract_price_after_label(
        body, ("total:", "payout:", "total amount:"),
    )

    ref_match = re.search(r"Booking ID:\s*(\S+)", body, re.IGNORECASE)
    extra: dict = {}
    if ref_match:
        extra["booking_reference"] = ref_match.group(1)

    return BookingParseResult(
        is_booking=True,
        source_channel="vrbo",
        source_listing_id=source_listing_id,
        guest_name=guest_name,
        check_in=check_in,
        check_out=check_out,
        total_price=total_price,
        extra=extra,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_date_after_label(text: str, labels: tuple[str, ...]) -> date | None:
    """Extract the first parseable date that follows one of the given labels."""
    for label in labels:
        pattern = re.compile(re.escape(label) + r"\s*(.{5,30})", re.IGNORECASE)
        m = pattern.search(text)
        if m:
            candidate = m.group(1).strip()
            parsed = _parse_written_date(candidate)
            if parsed:
                return parsed
    return None


def _extract_price_after_label(text: str, labels: tuple[str, ...]) -> str | None:
    """Extract the first price that follows one of the given labels."""
    for label in labels:
        pattern = re.compile(
            re.escape(label) + r"\s*(\$[\d,]+(?:\.\d{2})?)", re.IGNORECASE,
        )
        m = pattern.search(text)
        if m:
            return m.group(1)
    return _extract_price(text)


def _extract_date_range_from_subject(
    subject: str,
) -> tuple[date | None, date | None]:
    """Extract a date range from a subject line like 'Jun 5 - Jun 10'."""
    m = _DATE_RANGE_SHORT.search(subject)
    if not m:
        return None, None

    # Assume current or next year — heuristic for now.
    year = date.today().year

    def _make(month_abbr: str, day_str: str) -> date | None:
        month = _MONTHS.get(month_abbr.lower())
        if not month:
            return None
        try:
            d = date(year, int(month), int(day_str))
            # If the date is in the past by more than a week, try next year.
            if (date.today() - d).days > 7:
                d = date(year + 1, int(month), int(day_str))
            return d
        except ValueError:
            return None

    return _make(m.group(1), m.group(2)), _make(m.group(3), m.group(4))
