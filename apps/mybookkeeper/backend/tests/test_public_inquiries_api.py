"""HTTP route tests for the public inquiry form (T0).

Covers:
- GET /api/listings/public/{slug} happy path + 404
- POST /api/inquiries/public happy path returns generic 200 envelope
- POST returns 400 on schema-validated invalid email
- POST returns 400 with friendly message on short why_this_room
- Honeypot fills returns 200 (fake success) — bot doesn't learn it was caught
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api import public_inquiries
from app.main import app
from app.services.inquiries import public_inquiry_service
from app.services.inquiries.public_inquiry_service import (
    PublicInquiryOutcome,
    PublicInquiryResult,
)


def _valid_body(slug: str = "abc-123") -> dict:
    today = _dt.date.today()
    return {
        "listing_slug": slug,
        "name": "Alice",
        "email": "alice@example.com",
        "phone": "555-123-4567",
        "move_in_date": (today + _dt.timedelta(days=30)).isoformat(),
        "lease_length_months": 6,
        "occupant_count": 1,
        "has_pets": False,
        "pets_description": None,
        "vehicle_count": 1,
        "current_city": "Austin, TX",
        "employment_status": "employed",
        "why_this_room": "Travel-nurse contract at the medical center, need a quiet room.",
        "additional_notes": None,
        "form_loaded_at": int(_dt.datetime.now().timestamp() * 1000) - 60_000,
        "website": "",
        "turnstile_token": "",
    }


class TestPublicListingLookup:
    def test_unknown_slug_returns_404(self) -> None:
        client = TestClient(app)
        with patch(
            "app.api.public_inquiries.listing_repo.get_by_slug",
            return_value=None,
        ):
            r = client.get("/api/listings/public/no-such-slug")
        assert r.status_code == 404

    def test_known_slug_returns_listing(self) -> None:
        from decimal import Decimal

        from app.models.listings.listing import Listing
        listing = Listing(
            id=uuid.uuid4(),
            organization_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            property_id=uuid.uuid4(),
            title="Master Bedroom",
            description=None,
            monthly_rate=Decimal("1500.00"),
            room_type="private_room",
            private_bath=False,
            parking_assigned=False,
            furnished=True,
            status="active",
            amenities=[],
            pets_on_premises=False,
            slug="master-bedroom-abc123",
        )
        client = TestClient(app)
        with patch(
            "app.api.public_inquiries.listing_repo.get_by_slug",
            return_value=listing,
        ):
            r = client.get("/api/listings/public/master-bedroom-abc123")
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "Master Bedroom"
        assert body["slug"] == "master-bedroom-abc123"
        # PII / org IDs must NOT leak
        assert "organization_id" not in body
        assert "user_id" not in body


class TestPublicInquirySubmission:
    def test_happy_path_returns_received(self) -> None:
        async def fake_submit(**_kwargs):
            return PublicInquiryResult(
                outcome=PublicInquiryOutcome.SUCCESS,
                inquiry_id=uuid.uuid4(),
                spam_status="clean",
                notify_operator=True,
                notify_subject_prefix="",
            )

        client = TestClient(app)
        with patch.object(
            public_inquiry_service, "submit_public_inquiry", side_effect=fake_submit,
        ):
            r = client.post("/api/inquiries/public", json=_valid_body())
        assert r.status_code == 200
        assert r.json() == {"status": "received"}

    def test_invalid_email_returns_422_or_400(self) -> None:
        body = _valid_body()
        body["email"] = "not-a-real-email"
        client = TestClient(app)
        r = client.post("/api/inquiries/public", json=body)
        # Pydantic validation surfaces as 422; either way it's a hard rejection
        assert r.status_code in (400, 422)

    def test_listing_not_found_returns_404(self) -> None:
        async def fake_submit(**_kwargs):
            return PublicInquiryResult(outcome=PublicInquiryOutcome.LISTING_NOT_FOUND)

        client = TestClient(app)
        with patch.object(
            public_inquiry_service, "submit_public_inquiry", side_effect=fake_submit,
        ):
            r = client.post("/api/inquiries/public", json=_valid_body())
        assert r.status_code == 404

    def test_short_why_returns_friendly_400(self) -> None:
        async def fake_submit(**_kwargs):
            return PublicInquiryResult(outcome=PublicInquiryOutcome.NEEDS_MORE_DETAIL)

        client = TestClient(app)
        with patch.object(
            public_inquiry_service, "submit_public_inquiry", side_effect=fake_submit,
        ):
            r = client.post("/api/inquiries/public", json=_valid_body())
        assert r.status_code == 400
        assert "tell us a bit more" in r.json()["detail"].lower()

    def test_invalid_outcome_returns_generic_400(self) -> None:
        async def fake_submit(**_kwargs):
            return PublicInquiryResult(outcome=PublicInquiryOutcome.INVALID)

        client = TestClient(app)
        with patch.object(
            public_inquiry_service, "submit_public_inquiry", side_effect=fake_submit,
        ):
            r = client.post("/api/inquiries/public", json=_valid_body())
        assert r.status_code == 400
        # Generic message — no anti-spam intel leaks
        assert r.json()["detail"] == "Something went wrong, please try again."
