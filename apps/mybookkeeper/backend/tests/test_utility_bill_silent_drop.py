"""Regression: utility-bill notification emails must never be silently dropped.

Production symptom (2026-06): Constellation / CenterPoint / AT&T / City of
Houston Water "your bill is ready" / "Auto Pay" emails were fetched, run
through Claude, and produced ZERO transactions with NO error — 324 ``done`` /
0 ``failed`` queue rows, 0 transactions in 7 days, despite the emails carrying
real amounts ($232.84, $163.12, $251.64).

Root cause: the base prompt instructed Claude to tag "bill ready"
notifications as ``document_type="payment_confirmation"`` with ``amount=null``,
and ``save_email_extraction`` dropped the entire email whenever the batch
document_type was ``payment_confirmation``. The P2P carve-out only protected
Zelle/Venmo, not utilities.

These tests pin the structural fix at the persistence layer (the prompt is the
other half, validated separately): a document carrying a valid date + positive
amount must survive the payment-confirmation skip, must import as a visible
(``approved``) ``utilities`` expense, and an email that genuinely produces no
records must record a reason on its queue row.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.extraction.extraction_types import ExtractionData, ExtractionResult
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.extraction.extraction_persistence import (
    _has_recordable_expense,
    save_email_extraction,
)


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


def _result(data: ExtractionData) -> ExtractionResult:
    return {
        "data": [data],
        "tokens": 100,
        "input_tokens": 80,
        "output_tokens": 20,
        "model_name": "claude-test",
    }


def _utility_bill_data(
    *,
    vendor: str = "Constellation",
    amount: str = "232.84",
    document_type: str = "invoice",
    sub_category: str = "electricity",
) -> ExtractionData:
    """A Constellation 'bill ready / Auto Pay' notification with an amount."""
    return {
        "vendor": vendor,
        "amount": amount,
        "date": "2026-06-18",
        "document_type": document_type,
        "category": "utilities",
        "sub_category": sub_category,
        "transaction_type": "expense",
        "confidence": "high",
        "tags": ["utilities"],
        "description": "Electricity bill — Auto Pay scheduled",
        "account_number": None,
    }


class TestHasRecordableExpense:
    def test_valid_date_and_positive_amount(self) -> None:
        assert _has_recordable_expense(_utility_bill_data()) is True

    def test_null_amount_not_recordable(self) -> None:
        d = _utility_bill_data()
        d["amount"] = None
        assert _has_recordable_expense(d) is False

    def test_zero_amount_not_recordable(self) -> None:
        d = _utility_bill_data(amount="0.00")
        assert _has_recordable_expense(d) is False

    def test_missing_date_not_recordable(self) -> None:
        d = _utility_bill_data()
        d["date"] = None
        assert _has_recordable_expense(d) is False

    def test_numeric_amount_coerced(self) -> None:
        d = _utility_bill_data()
        d["amount"] = 232.84  # Claude sometimes emits a number, not a string
        assert _has_recordable_expense(d) is True

    def test_garbage_amount_degrades_to_false(self) -> None:
        d = _utility_bill_data(amount="not-a-number")
        assert _has_recordable_expense(d) is False


class TestUtilityBillImports:
    """The core regression: the email must NOT be silently dropped."""

    @pytest.mark.asyncio
    async def test_bill_ready_invoice_creates_transaction(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = await _seed_org_user(db)

        outcome = await save_email_extraction(
            message_id=f"msg-{uuid.uuid4().hex}",
            subject="Your Constellation bill is ready",
            result=_result(_utility_bill_data()),
            source_att=None,  # email body, no attachment
            organization_id=org_id,
            user_id=user_id,
            db=db,
            sender_email="noreply@constellation.com",
        )

        assert outcome.records_added == 1
        assert outcome.skip_reason is None

        txn = (
            await db.execute(
                select(Transaction).where(Transaction.organization_id == org_id)
            )
        ).scalar_one()
        assert txn.amount == Decimal("232.84")
        assert txn.category == "utilities"

    @pytest.mark.asyncio
    async def test_bill_with_amount_survives_payment_confirmation_tag(
        self, db: AsyncSession
    ) -> None:
        """Even if Claude STILL mis-tags the bill as payment_confirmation, a
        positive amount + valid date must keep the email from being dropped."""
        org_id, user_id = await _seed_org_user(db)

        outcome = await save_email_extraction(
            message_id=f"msg-{uuid.uuid4().hex}",
            subject="Auto Pay scheduled",
            result=_result(
                _utility_bill_data(document_type="payment_confirmation")
            ),
            source_att=None,
            organization_id=org_id,
            user_id=user_id,
            db=db,
            sender_email="noreply@constellation.com",
        )

        assert outcome.records_added == 1
        txn = (
            await db.execute(
                select(Transaction).where(Transaction.organization_id == org_id)
            )
        ).scalar_one()
        assert txn.amount == Decimal("232.84")

    @pytest.mark.asyncio
    async def test_utility_bill_is_visible_not_unverified(
        self, db: AsyncSession
    ) -> None:
        """The dashboard sums status=='approved'. A utility bill from a
        non-trusted sender used to land 'unverified' (hidden). It must now be
        visible."""
        org_id, user_id = await _seed_org_user(db)

        await save_email_extraction(
            message_id=f"msg-{uuid.uuid4().hex}",
            subject="Your CenterPoint bill",
            result=_result(
                _utility_bill_data(vendor="CenterPoint", sub_category="gas")
            ),
            source_att=None,
            organization_id=org_id,
            user_id=user_id,
            db=db,
            sender_email="ebill@centerpointenergy.com",  # NOT a trusted sender
        )

        txn = (
            await db.execute(
                select(Transaction).where(Transaction.organization_id == org_id)
            )
        ).scalar_one()
        assert txn.status == "approved"


class TestGenuinePaymentConfirmationStillSkipped:
    """Do not regress the legitimate payment_confirmation skip."""

    @pytest.mark.asyncio
    async def test_amountless_payment_confirmation_skipped_with_reason(
        self, db: AsyncSession
    ) -> None:
        org_id, user_id = await _seed_org_user(db)

        data: ExtractionData = {
            "vendor": "Constellation",
            "amount": None,
            "date": None,
            "document_type": "payment_confirmation",
            "category": "uncategorized",
            "confidence": "high",
            "tags": ["uncategorized"],
            "description": "Thank you for your payment",
            "account_number": None,
        }

        outcome = await save_email_extraction(
            message_id=f"msg-{uuid.uuid4().hex}",
            subject="Payment received",
            result=_result(data),
            source_att=None,
            organization_id=org_id,
            user_id=user_id,
            db=db,
            sender_email="noreply@constellation.com",
        )

        assert outcome.records_added == 0
        assert outcome.skip_reason is not None
        # No transaction was created.
        rows = (
            await db.execute(
                select(Transaction).where(Transaction.organization_id == org_id)
            )
        ).scalars().all()
        assert rows == []


class TestP2PStillProtected:
    """Do not regress the peer-to-peer carve-out."""

    @pytest.mark.asyncio
    async def test_zelle_payment_still_imports(self, db: AsyncSession) -> None:
        org_id, user_id = await _seed_org_user(db)

        data: ExtractionData = {
            "vendor": "Zelle",
            "payer_name": "Sonu King",
            "amount": "701.20",
            "date": "2026-05-03",
            "document_type": "invoice",
            "category": "rental_revenue",
            "transaction_type": "income",
            "confidence": "high",
            "tags": ["rental_revenue"],
            "account_number": None,
        }

        outcome = await save_email_extraction(
            message_id=f"msg-{uuid.uuid4().hex}",
            subject="You received money with Zelle",
            result=_result(data),
            source_att=None,
            organization_id=org_id,
            user_id=user_id,
            db=db,
            sender_email="alerts@zellepay.com",
        )

        assert outcome.records_added == 1
