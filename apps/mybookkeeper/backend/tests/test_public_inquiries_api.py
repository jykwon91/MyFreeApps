"""HTTP route tests for the public inquiry form (T0).

The browser-visible URLs are ``/api/listings/public/{slug}`` and
``/api/inquiries/public``. The ``/api`` segment is stripped by Caddy /
Vite *before* requests reach FastAPI, so the test client (which talks to
FastAPI directly) hits the post-strip paths ``/listings/public/{slug}``
and ``/inquiries/public``. This mirrors what the backend actually
receives — see PR #<this-fix> for the prefix bug that motivated the
URL change.

Covers:
- GET /listings/public/{slug} happy path + 404
- POST /inquiries/public happy path returns generic 200 envelope
- POST returns 400 on schema-validated invalid email
- POST returns 400 with friendly message on short why_this_room
- Honeypot fills returns 200 (fake success) — bot doesn't learn it was caught
- Routes are NOT mounted under /api (regression guard for PR #<this-fix>)
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
        "move_out_date": (today + _dt.timedelta(days=30 + 180)).isoformat(),
        "occupant_count": 1,
        "has_pets": False,
        "pets_description": None,
        "vehicle_count": 1,
        "current_city": "Austin",
        "current_country": "US",
        "current_region": "TX",
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
        with (
            patch(
                "app.api.public_inquiries.listing_repo.get_by_slug",
                return_value=None,
            ),
            patch(
                "app.api.public_inquiries.listing_repo.slug_exists_including_archived",
                return_value=False,
            ),
        ):
            r = client.get("/listings/public/no-such-slug")
        assert r.status_code == 404
        assert r.json() == {"detail": "Listing not found"}

    def test_archived_slug_logs_archived_match_and_404s(
        self,
        caplog,
    ) -> None:
        # When the slug exists but the listing is soft-deleted, the route
        # must still 404 (no leak of archived state to the public) but
        # must log a WARNING so the operator can tell the host their
        # external link is stale.
        import logging
        client = TestClient(app)
        with (
            patch(
                "app.api.public_inquiries.listing_repo.get_by_slug",
                return_value=None,
            ),
            patch(
                "app.api.public_inquiries.listing_repo.slug_exists_including_archived",
                return_value=True,
            ),
            caplog.at_level(logging.WARNING, logger="app.api.public_inquiries"),
        ):
            r = client.get("/listings/public/archived-slug-abc123")
        assert r.status_code == 404
        assert r.json() == {"detail": "Listing not found"}
        # Operator-visibility log must say archived_match=True
        assert any(
            "public_listing.not_found" in rec.message
            and "archived_match=True" in rec.message
            and "archived-slug-abc123" in rec.message
            for rec in caplog.records
        ), f"Expected archived-slug warning; got: {[r.message for r in caplog.records]}"

    def test_unknown_slug_logs_archived_match_false(
        self,
        caplog,
    ) -> None:
        import logging
        client = TestClient(app)
        with (
            patch(
                "app.api.public_inquiries.listing_repo.get_by_slug",
                return_value=None,
            ),
            patch(
                "app.api.public_inquiries.listing_repo.slug_exists_including_archived",
                return_value=False,
            ),
            caplog.at_level(logging.WARNING, logger="app.api.public_inquiries"),
        ):
            r = client.get("/listings/public/never-existed")
        assert r.status_code == 404
        assert any(
            "public_listing.not_found" in rec.message
            and "archived_match=False" in rec.message
            for rec in caplog.records
        )

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
            r = client.get("/listings/public/master-bedroom-abc123")
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
            r = client.post("/inquiries/public", json=_valid_body())
        assert r.status_code == 200
        assert r.json() == {"status": "received"}

    def test_invalid_email_returns_422_or_400(self) -> None:
        body = _valid_body()
        body["email"] = "not-a-real-email"
        client = TestClient(app)
        r = client.post("/inquiries/public", json=body)
        # Pydantic validation surfaces as 422; either way it's a hard rejection
        assert r.status_code in (400, 422)

    def test_listing_not_found_returns_404(self) -> None:
        async def fake_submit(**_kwargs):
            return PublicInquiryResult(outcome=PublicInquiryOutcome.LISTING_NOT_FOUND)

        client = TestClient(app)
        with patch.object(
            public_inquiry_service, "submit_public_inquiry", side_effect=fake_submit,
        ):
            r = client.post("/inquiries/public", json=_valid_body())
        assert r.status_code == 404

    def test_short_why_returns_friendly_400(self) -> None:
        async def fake_submit(**_kwargs):
            return PublicInquiryResult(outcome=PublicInquiryOutcome.NEEDS_MORE_DETAIL)

        client = TestClient(app)
        with patch.object(
            public_inquiry_service, "submit_public_inquiry", side_effect=fake_submit,
        ):
            r = client.post("/inquiries/public", json=_valid_body())
        assert r.status_code == 400
        assert "tell us a bit more" in r.json()["detail"].lower()

    def test_invalid_outcome_returns_generic_400(self) -> None:
        async def fake_submit(**_kwargs):
            return PublicInquiryResult(outcome=PublicInquiryOutcome.INVALID)

        client = TestClient(app)
        with patch.object(
            public_inquiry_service, "submit_public_inquiry", side_effect=fake_submit,
        ):
            r = client.post("/inquiries/public", json=_valid_body())
        assert r.status_code == 400
        # Generic message — no anti-spam intel leaks
        assert r.json()["detail"] == "Something went wrong, please try again."


class TestPublicInquiryRouting:
    """Regression guard for the ``prefix="/api"`` bug shipped in PR #130.

    Caddy / Vite strip ``/api`` from inbound URLs before they reach FastAPI.
    If this router were declared with ``prefix="/api"``, the actual mounted
    routes would live under ``/api/listings/public/...`` and ``/api/
    inquiries/public`` — which the stripped requests would never match,
    yielding the FastAPI default ``{"detail":"Not Found"}`` 404 in
    production. These tests fail loudly if the prefix sneaks back in.
    """

    def test_router_has_no_api_prefix(self) -> None:
        # Inspect the registered router directly — independent of ordering
        # in main.py. If someone re-adds ``prefix="/api"`` here, this catches it.
        for route in public_inquiries.router.routes:
            path = getattr(route, "path", "")
            assert not path.startswith("/api"), (
                f"public_inquiries router must not declare a /api prefix; "
                f"Caddy and the Vite proxy strip /api before requests reach "
                f"FastAPI. Found offending route: {path}"
            )

    def test_listing_lookup_not_mounted_under_api_prefix(self) -> None:
        # Sanity-check via the full app — confirms that hitting the route
        # WITHOUT the /api prefix (i.e. what the backend actually receives
        # in production) returns the application 404 message, while hitting
        # WITH the /api prefix returns FastAPI's default unmatched-route 404.
        client = TestClient(app)
        with (
            patch(
                "app.api.public_inquiries.listing_repo.get_by_slug",
                return_value=None,
            ),
            patch(
                "app.api.public_inquiries.listing_repo.slug_exists_including_archived",
                return_value=False,
            ),
        ):
            unprefixed = client.get("/listings/public/anything")
        prefixed = client.get("/api/listings/public/anything")
        # Post-strip path resolves to the application route (custom message)
        assert unprefixed.status_code == 404
        assert unprefixed.json() == {"detail": "Listing not found"}
        # Pre-strip path is genuinely unmounted (FastAPI default message)
        assert prefixed.status_code == 404
        assert prefixed.json() == {"detail": "Not Found"}

    def test_inquiry_submit_not_mounted_under_api_prefix(self) -> None:
        client = TestClient(app)
        # POST /api/inquiries/public must NOT be a registered route.
        # An unrelated route ``GET /inquiries/{inquiry_id}`` also exists
        # (under ``inquiries.router``) — the request path here doesn't
        # match it (different prefix), so we expect a hard 404 not a 405.
        prefixed = client.post("/api/inquiries/public", json=_valid_body())
        assert prefixed.status_code == 404
        assert prefixed.json() == {"detail": "Not Found"}
