"""Schema-level tests for ``PublicInquiryRequest``.

Focus: the cross-field rule that ``current_region`` must be a valid US
state code when ``current_country == "US"``, and is otherwise free text
up to 100 chars. Numeric/range/length constraints already covered by the
schema-level Field constructors are not re-tested here.
"""
from __future__ import annotations

import datetime as _dt

import pytest
from pydantic import ValidationError

from app.schemas.inquiries.public_inquiry_request import PublicInquiryRequest


def _payload(**overrides) -> dict:
    base = {
        "listing_slug": "master-bedroom-abc123",
        "name": "Alice Smith",
        "email": "alice@example.com",
        "phone": "555-123-4567",
        "move_in_date": _dt.date.today() + _dt.timedelta(days=14),
        "lease_length_months": 6,
        "occupant_count": 1,
        "has_pets": False,
        "vehicle_count": 1,
        "current_city": "Austin",
        "current_country": "US",
        "current_region": "TX",
        "employment_status": "employed",
        "why_this_room": "Relocating for a 13-week travel-nurse assignment.",
        "form_loaded_at": int(_dt.datetime.now().timestamp() * 1000) - 60_000,
    }
    base.update(overrides)
    return base


class TestUsRegionValidation:
    def test_accepts_valid_us_state(self) -> None:
        req = PublicInquiryRequest(**_payload(current_country="US", current_region="TX"))
        assert req.current_country == "US"
        assert req.current_region == "TX"

    def test_rejects_unknown_us_state(self) -> None:
        with pytest.raises(ValidationError):
            PublicInquiryRequest(**_payload(current_country="US", current_region="ZZ"))

    def test_rejects_lowercase_us_state(self) -> None:
        # Frontend sends uppercase; lowercase reaching the backend is a bot
        # or hand-rolled curl. Reject to keep the column canonical.
        with pytest.raises(ValidationError):
            PublicInquiryRequest(**_payload(current_country="US", current_region="tx"))

    def test_accepts_freeform_region_for_non_us_country(self) -> None:
        req = PublicInquiryRequest(
            **_payload(current_country="NO", current_region="Oslo County"),
        )
        assert req.current_country == "NO"
        assert req.current_region == "Oslo County"

    def test_rejects_empty_region(self) -> None:
        with pytest.raises(ValidationError):
            PublicInquiryRequest(**_payload(current_country="CA", current_region=""))

    def test_rejects_invalid_country_code(self) -> None:
        with pytest.raises(ValidationError):
            # Lowercase/3-letter/numeric all reject via the regex.
            PublicInquiryRequest(**_payload(current_country="us", current_region="TX"))

    def test_country_defaults_to_us(self) -> None:
        payload = _payload()
        del payload["current_country"]
        req = PublicInquiryRequest(**payload)
        assert req.current_country == "US"
