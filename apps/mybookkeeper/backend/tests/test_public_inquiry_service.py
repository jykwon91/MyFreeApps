"""Service-layer tests for the public inquiry submission pipeline (T0).

Covers:
- Happy path: clean submission inserts inquiry + assessments + spam_status='clean'
- Honeypot: bot fills website field → fake success, spam_status='spam', no operator email
- Disposable email: mailinator.com → spam_status='spam'
- Submit timing < 5s: inquiry stored with fast_submit flag but still processed
- Move-in date out of window: rejected with INVALID
- Phone format invalid: rejected with INVALID
- Why-this-room < 30 chars: rejected with NEEDS_MORE_DETAIL (friendly hint)
- Listing slug unknown: LISTING_NOT_FOUND
- Claude scoring degraded: spam_status='unscored', operator notified
- Manual override: writes manual_override row + flips spam_status

These tests intentionally use the service module's own DB session manager — we
patch ``unit_of_work`` so the in-memory SQLite session is used end-to-end.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_spam_assessment import InquirySpamAssessment
from app.models.listings.listing import Listing
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.schemas.inquiries.public_inquiry_request import PublicInquiryRequest
from app.services.inquiries import (
    inquiry_spam_scorer,
    public_inquiry_service,
)
from app.services.inquiries.inquiry_spam_scorer import (
    ClaudeScoringDegraded,
    ClaudeScoringResult,
)
from app.services.inquiries.public_inquiry_service import PublicInquiryOutcome


@pytest.fixture
def patch_session(monkeypatch: pytest.MonkeyPatch, db: AsyncSession):
    @asynccontextmanager
    async def _uow():
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    monkeypatch.setattr(public_inquiry_service, "unit_of_work", _uow)
    return None


@pytest.fixture
async def test_listing(db: AsyncSession, test_user: User, test_org: Organization) -> Listing:
    prop = Property(
        organization_id=test_org.id,
        user_id=test_user.id,
        name="Travel Nurse House",
        address="100 Med Center Dr",
    )
    db.add(prop)
    await db.flush()
    listing = Listing(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        user_id=test_user.id,
        property_id=prop.id,
        title="Master Bedroom",
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
    db.add(listing)
    await db.commit()
    return listing


def _payload(slug: str = "master-bedroom-abc123", **overrides) -> PublicInquiryRequest:
    base = {
        "listing_slug": slug,
        "name": "Alice Smith",
        "email": "alice@example.com",
        "phone": "555-123-4567",
        "move_in_date": _dt.date.today() + _dt.timedelta(days=14),
        "lease_length_months": 6,
        "occupant_count": 1,
        "has_pets": False,
        "pets_description": None,
        "vehicle_count": 1,
        "current_city": "Austin",
        "current_country": "US",
        "current_region": "TX",
        "employment_status": "employed",
        "why_this_room": (
            "I'm a travel nurse on a 13-week assignment at the medical center "
            "and your listing fits my budget and commute."
        ),
        "additional_notes": None,
        "form_loaded_at": int(_dt.datetime.now().timestamp() * 1000) - 60_000,
        "website": "",
        "turnstile_token": "test-token",
    }
    base.update(overrides)
    return PublicInquiryRequest(**base)


def _clean_claude_result() -> ClaudeScoringResult:
    return ClaudeScoringResult(
        score=85,
        reason="Specific employment context, realistic move-in window.",
        flags=[],
        raw_prompt="prompt",
        raw_response='{"score":85,"reason":"ok","flags":[]}',
    )


class TestPublicInquiryHappyPath:
    @pytest.mark.asyncio
    async def test_clean_inquiry_creates_row_and_assessments(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        with patch.object(
            inquiry_spam_scorer, "score_inquiry", return_value=_clean_claude_result(),
        ):
            result = await public_inquiry_service.submit_public_inquiry(
                payload=_payload(),
                client_ip="1.2.3.4",
                user_agent="Mozilla/5.0",
                turnstile_passed=True,
                rate_limited=False,
            )

        assert result.outcome == PublicInquiryOutcome.SUCCESS
        assert result.spam_status == "clean"
        assert result.notify_operator is True
        assert result.notify_subject_prefix == ""

        # Inquiry persisted
        rows = (await db.execute(select(Inquiry))).scalars().all()
        assert len(rows) == 1
        inquiry = rows[0]
        assert inquiry.source == "public_form"
        assert inquiry.submitted_via == "public_form"
        assert inquiry.spam_status == "clean"
        assert inquiry.spam_score is not None
        assert float(inquiry.spam_score) == 85.0
        assert inquiry.move_in_date is not None
        assert inquiry.lease_length_months == 6
        assert inquiry.listing_id == test_listing.id

        # Assessments — turnstile, honeypot, submit_timing, disposable_email, claude_score
        assessments = (
            await db.execute(select(InquirySpamAssessment))
        ).scalars().all()
        types = {a.assessment_type for a in assessments}
        assert "turnstile" in types
        assert "honeypot" in types
        assert "submit_timing" in types
        assert "disposable_email" in types
        assert "claude_score" in types


class TestHoneypot:
    @pytest.mark.asyncio
    async def test_honeypot_filled_marks_spam_returns_fake_success(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        result = await public_inquiry_service.submit_public_inquiry(
            payload=_payload(website="http://spam-site.example.com"),
            client_ip="1.2.3.4",
            user_agent="bot/1.0",
            turnstile_passed=True,
            rate_limited=False,
        )
        # Bot must see success
        assert result.outcome == PublicInquiryOutcome.SUCCESS
        assert result.spam_status == "spam"
        assert result.notify_operator is False

        # Inquiry stored as spam
        inquiry = (await db.execute(select(Inquiry))).scalar_one()
        assert inquiry.spam_status == "spam"

        # Honeypot assessment exists with passed=False
        honeypot = (
            await db.execute(
                select(InquirySpamAssessment).where(
                    InquirySpamAssessment.assessment_type == "honeypot",
                )
            )
        ).scalar_one()
        assert honeypot.passed is False


class TestDisposableEmail:
    @pytest.mark.asyncio
    async def test_disposable_domain_marks_spam(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        result = await public_inquiry_service.submit_public_inquiry(
            payload=_payload(email="throwaway@mailinator.com"),
            client_ip="1.2.3.4",
            user_agent="curl/8.0",
            turnstile_passed=True,
            rate_limited=False,
        )
        assert result.outcome == PublicInquiryOutcome.SUCCESS
        assert result.spam_status == "spam"

        disposable = (
            await db.execute(
                select(InquirySpamAssessment).where(
                    InquirySpamAssessment.assessment_type == "disposable_email",
                )
            )
        ).scalar_one()
        assert disposable.passed is False

    @pytest.mark.asyncio
    async def test_legitimate_domain_passes(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        with patch.object(
            inquiry_spam_scorer, "score_inquiry", return_value=_clean_claude_result(),
        ):
            result = await public_inquiry_service.submit_public_inquiry(
                payload=_payload(email="real-user@gmail.com"),
                client_ip="1.2.3.4",
                user_agent="Mozilla/5.0",
                turnstile_passed=True,
                rate_limited=False,
            )
        assert result.spam_status == "clean"


class TestInputValidation:
    @pytest.mark.asyncio
    async def test_phone_with_too_few_digits_rejected(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        # Schema's min_length is 7 chars; the service applies a stricter
        # 10-11 digit check after stripping non-digits. ``abc-defg`` passes
        # the length gate (7 chars) but has zero digits, so the service
        # rejects it with INVALID.
        result = await public_inquiry_service.submit_public_inquiry(
            payload=_payload(phone="abc-defg"),
            client_ip="1.2.3.4",
            user_agent="Mozilla/5.0",
            turnstile_passed=True,
            rate_limited=False,
        )
        assert result.outcome == PublicInquiryOutcome.INVALID
        # No inquiry was created
        rows = (await db.execute(select(Inquiry))).scalars().all()
        assert rows == []

    @pytest.mark.asyncio
    async def test_move_in_date_in_past_rejected(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        old = _dt.date.today() - _dt.timedelta(days=120)
        result = await public_inquiry_service.submit_public_inquiry(
            payload=_payload(move_in_date=old),
            client_ip="1.2.3.4",
            user_agent="Mozilla/5.0",
            turnstile_passed=True,
            rate_limited=False,
        )
        assert result.outcome == PublicInquiryOutcome.INVALID

    @pytest.mark.asyncio
    async def test_short_why_returns_friendly_hint(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        result = await public_inquiry_service.submit_public_inquiry(
            payload=_payload(why_this_room="too short"),
            client_ip="1.2.3.4",
            user_agent="Mozilla/5.0",
            turnstile_passed=True,
            rate_limited=False,
        )
        assert result.outcome == PublicInquiryOutcome.NEEDS_MORE_DETAIL


class TestListingResolution:
    @pytest.mark.asyncio
    async def test_unknown_slug_returns_not_found(
        self, db: AsyncSession, patch_session,
    ) -> None:
        result = await public_inquiry_service.submit_public_inquiry(
            payload=_payload(slug="does-not-exist"),
            client_ip="1.2.3.4",
            user_agent="Mozilla/5.0",
            turnstile_passed=True,
            rate_limited=False,
        )
        assert result.outcome == PublicInquiryOutcome.LISTING_NOT_FOUND


class TestClaudeDegradation:
    @pytest.mark.asyncio
    async def test_claude_failure_stores_unscored_inquiry(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        degraded = ClaudeScoringDegraded(
            error="ConnectionError: timeout",
            raw_prompt="prompt",
            raw_response=None,
        )
        with patch.object(inquiry_spam_scorer, "score_inquiry", return_value=degraded):
            result = await public_inquiry_service.submit_public_inquiry(
                payload=_payload(),
                client_ip="1.2.3.4",
                user_agent="Mozilla/5.0",
                turnstile_passed=True,
                rate_limited=False,
            )
        assert result.outcome == PublicInquiryOutcome.SUCCESS
        assert result.spam_status == "unscored"
        # Operator still notified — we don't lose legitimate inquiries on outage
        assert result.notify_operator is True

        inquiry = (await db.execute(select(Inquiry))).scalar_one()
        assert inquiry.spam_status == "unscored"
        assert inquiry.spam_score is None

        claude_row = (
            await db.execute(
                select(InquirySpamAssessment).where(
                    InquirySpamAssessment.assessment_type == "claude_score",
                )
            )
        ).scalar_one()
        assert claude_row.passed is None  # graceful degrade signal


class TestSubmitTiming:
    @pytest.mark.asyncio
    async def test_fast_submit_flagged_but_processed(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        # form_loaded_at = now → delta < 5s → flagged
        now_ms = int(_dt.datetime.now().timestamp() * 1000)
        with patch.object(
            inquiry_spam_scorer, "score_inquiry", return_value=_clean_claude_result(),
        ):
            result = await public_inquiry_service.submit_public_inquiry(
                payload=_payload(form_loaded_at=now_ms - 1000),  # 1s ago
                client_ip="1.2.3.4",
                user_agent="Mozilla/5.0",
                turnstile_passed=True,
                rate_limited=False,
            )
        assert result.outcome == PublicInquiryOutcome.SUCCESS
        # Still scored clean if Claude returns 85
        assert result.spam_status == "clean"

        timing = (
            await db.execute(
                select(InquirySpamAssessment).where(
                    InquirySpamAssessment.assessment_type == "submit_timing",
                )
            )
        ).scalar_one()
        assert timing.passed is False
        assert "fast_submit" in (timing.flags or [])


class TestSpamScoreThreshold:
    @pytest.mark.asyncio
    async def test_score_below_threshold_marks_spam(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        low_score = ClaudeScoringResult(
            score=15,
            reason="Generic message, no specifics.",
            flags=["very_short_message", "no_specifics"],
            raw_prompt="prompt",
            raw_response="...",
        )
        with patch.object(inquiry_spam_scorer, "score_inquiry", return_value=low_score):
            result = await public_inquiry_service.submit_public_inquiry(
                payload=_payload(),
                client_ip="1.2.3.4",
                user_agent="Mozilla/5.0",
                turnstile_passed=True,
                rate_limited=False,
            )
        assert result.spam_status == "spam"
        assert result.notify_operator is False

    @pytest.mark.asyncio
    async def test_score_in_flagged_band_notifies_with_prefix(
        self, db: AsyncSession, test_listing: Listing, patch_session,
    ) -> None:
        # threshold default 30; flagged band is [30, 60). Score 45 → flagged.
        mid_score = ClaudeScoringResult(
            score=45,
            reason="Borderline.",
            flags=["vague_movein"],
            raw_prompt="prompt",
            raw_response="...",
        )
        with patch.object(inquiry_spam_scorer, "score_inquiry", return_value=mid_score):
            result = await public_inquiry_service.submit_public_inquiry(
                payload=_payload(),
                client_ip="1.2.3.4",
                user_agent="Mozilla/5.0",
                turnstile_passed=True,
                rate_limited=False,
            )
        assert result.spam_status == "flagged"
        assert result.notify_operator is True
        assert result.notify_subject_prefix == "[FLAGGED] "


class TestManualOverride:
    @pytest.mark.asyncio
    async def test_mark_not_spam_writes_assessment_and_updates_status(
        self, db: AsyncSession, test_listing: Listing, test_user: User,
        patch_session,
    ) -> None:
        # Seed an inquiry directly
        from app.repositories.inquiries import inquiry_repo
        inquiry = await inquiry_repo.create(
            db,
            organization_id=test_listing.organization_id,
            user_id=test_user.id,
            source="public_form",
            received_at=_dt.datetime.now(_dt.timezone.utc),
            spam_status="spam",
            submitted_via="public_form",
        )
        await db.commit()

        await public_inquiry_service.manual_override(
            inquiry_id=inquiry.id,
            organization_id=test_listing.organization_id,
            new_spam_status="manually_cleared",
            actor_user_id=test_user.id,
        )

        refreshed = (
            await db.execute(select(Inquiry).where(Inquiry.id == inquiry.id))
        ).scalar_one()
        assert refreshed.spam_status == "manually_cleared"

        override = (
            await db.execute(
                select(InquirySpamAssessment).where(
                    InquirySpamAssessment.assessment_type == "manual_override",
                )
            )
        ).scalar_one()
        assert override.passed is True
        assert override.details_json is not None
        assert override.details_json.get("actor_user_id") == str(test_user.id)
