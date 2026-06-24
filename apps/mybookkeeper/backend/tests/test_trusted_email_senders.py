"""Trusted-sender allowlist: domain matching + email-body approve/unverify gate.

The dashboard sums only ``status='approved'`` transactions. Email-body
extractions land as ``unverified`` so the user reviews them — except when
the sender domain is on the trusted payment allowlist (Airbnb, Zelle,
etc.), in which case they auto-approve.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.trusted_email_senders import (
    TRUSTED_PAYMENT_SENDERS,
    _extract_domain,
    is_trusted_sender,
)
from app.models.extraction.extraction_types import ExtractionData, ExtractionResult
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.extraction.extraction_persistence import save_email_extraction
from sqlalchemy import select


class TestExtractDomain:
    def test_simple_email(self) -> None:
        assert _extract_domain("noreply@airbnb.com") == "airbnb.com"

    def test_lowercases_domain(self) -> None:
        assert _extract_domain("Receipt@Airbnb.COM") == "airbnb.com"

    def test_subdomain_preserved(self) -> None:
        assert _extract_domain("auto@mailer.airbnb.com") == "mailer.airbnb.com"

    def test_no_at_sign_returns_none(self) -> None:
        assert _extract_domain("not-an-email") is None

    def test_strips_trailing_angle_bracket(self) -> None:
        # "Airbnb <noreply@airbnb.com>" — caller may pass the raw header
        assert _extract_domain("noreply@airbnb.com>") == "airbnb.com"

    def test_empty_domain_returns_none(self) -> None:
        assert _extract_domain("foo@") is None


class TestIsTrustedSender:
    def test_exact_domain_match(self) -> None:
        assert is_trusted_sender("noreply@airbnb.com") is True
        assert is_trusted_sender("payments@zellepay.com") is True
        assert is_trusted_sender("receipt@vrbo.com") is True
        assert is_trusted_sender("reservation@booking.com") is True
        assert is_trusted_sender("hello@vello.app") is True
        assert is_trusted_sender("noreply@furnishedfinder.com") is True

    def test_subdomain_match(self) -> None:
        assert is_trusted_sender("auto@mailer.airbnb.com") is True
        assert is_trusted_sender("x@notifications.booking.com") is True

    def test_case_insensitive(self) -> None:
        assert is_trusted_sender("Noreply@Airbnb.COM") is True

    def test_untrusted_domain(self) -> None:
        assert is_trusted_sender("billing@comcast.com") is False
        assert is_trusted_sender("info@randomvendor.com") is False

    def test_lookalike_suffix_does_not_match(self) -> None:
        # "evilairbnb.com" must NOT match "airbnb.com" — only proper subdomains
        assert is_trusted_sender("phish@evilairbnb.com") is False
        assert is_trusted_sender("x@notairbnb.com") is False

    def test_none_returns_false(self) -> None:
        assert is_trusted_sender(None) is False

    def test_empty_string_returns_false(self) -> None:
        assert is_trusted_sender("") is False

    def test_malformed_returns_false(self) -> None:
        assert is_trusted_sender("just-a-name") is False

    def test_allowlist_membership(self) -> None:
        assert "airbnb.com" in TRUSTED_PAYMENT_SENDERS
        assert "zellepay.com" in TRUSTED_PAYMENT_SENDERS


async def _seed_org_user(db: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
    user = User(
        id=uuid.uuid4(),
        email=f"test-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    org = Organization(id=uuid.uuid4(), name="Test Org", created_by=user.id)
    db.add(org)
    await db.commit()
    await db.refresh(user)
    await db.refresh(org)
    return org.id, user.id


def _make_extraction_result(amount: str = "150.00", vendor: str = "Airbnb") -> ExtractionResult:
    data: ExtractionData = {
        "vendor": vendor,
        "amount": amount,
        "date": "2025-06-15",
        "document_type": "invoice",
        "confidence": "high",
        "tags": ["rental_revenue"],
    }
    return {
        "data": [data],
        "tokens": 100,
        "input_tokens": 80,
        "output_tokens": 20,
        "model_name": "claude-test",
    }


class TestEmailBodyApprovalGate:
    """End-to-end: save_email_extraction honors the trusted-sender gate."""

    @pytest.mark.asyncio
    async def test_trusted_sender_body_creates_approved_transaction(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = await _seed_org_user(db)

        outcome = await save_email_extraction(
            message_id=f"msg-{uuid.uuid4().hex}",
            subject="Reservation confirmed",
            result=_make_extraction_result(amount="425.00", vendor="Airbnb"),
            source_att=None,  # body-only → would normally be "unverified"
            organization_id=org_id,
            user_id=user_id,
            db=db,
            sender_email="automated@airbnb.com",
        )
        assert outcome.records_added == 1
        assert outcome.skip_reason is None

        txn = (await db.execute(
            select(Transaction).where(Transaction.organization_id == org_id)
        )).scalar_one()
        assert txn.status == "approved"
        assert txn.amount == Decimal("425.00")

    @pytest.mark.asyncio
    async def test_trusted_subdomain_also_approved(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = await _seed_org_user(db)

        await save_email_extraction(
            message_id=f"msg-{uuid.uuid4().hex}",
            subject="Payment sent",
            result=_make_extraction_result(amount="700.00", vendor="Zelle"),
            source_att=None,
            organization_id=org_id,
            user_id=user_id,
            db=db,
            sender_email="alerts@notifications.zellepay.com",
        )

        txn = (await db.execute(
            select(Transaction).where(Transaction.organization_id == org_id)
        )).scalar_one()
        assert txn.status == "approved"

    @pytest.mark.asyncio
    async def test_unknown_sender_body_creates_unverified_transaction(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = await _seed_org_user(db)

        await save_email_extraction(
            message_id=f"msg-{uuid.uuid4().hex}",
            subject="Random invoice",
            result=_make_extraction_result(amount="99.00", vendor="Comcast"),
            source_att=None,
            organization_id=org_id,
            user_id=user_id,
            db=db,
            sender_email="billing@comcast.com",
        )

        txn = (await db.execute(
            select(Transaction).where(Transaction.organization_id == org_id)
        )).scalar_one()
        assert txn.status == "unverified"

    @pytest.mark.asyncio
    async def test_missing_sender_body_creates_unverified_transaction(
        self, db: AsyncSession
    ) -> None:
        # Legacy emails fetched before from_address wiring will have no sender.
        # Must fall back to the safe path: unverified.
        org_id, user_id = await _seed_org_user(db)

        await save_email_extraction(
            message_id=f"msg-{uuid.uuid4().hex}",
            subject="Legacy email",
            result=_make_extraction_result(amount="42.00", vendor="Unknown"),
            source_att=None,
            organization_id=org_id,
            user_id=user_id,
            db=db,
            sender_email=None,
        )

        txn = (await db.execute(
            select(Transaction).where(Transaction.organization_id == org_id)
        )).scalar_one()
        assert txn.status == "unverified"
