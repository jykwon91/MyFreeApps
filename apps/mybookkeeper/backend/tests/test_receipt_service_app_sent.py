"""send_receipt must record the sent Gmail message ID as app-sent.

The receipt email matches the Gmail ingestion query (``subject:receipt`` +
``has:attachment``). Without the send-time ``email_filter_logs`` record the
next sync would re-extract the app's own receipt as a duplicate income
transaction under the tenant's name — which the payer-keyed dedup cannot
match against the original Zelle notification when the actual sender was a
different person (spouse, family member).

The record is written in its OWN transaction, before the attachment
persistence, so it survives even when the post-send DB phase fails.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage as _storage_module
from app.models.applicants.applicant import Applicant
from app.models.email.email_filter_log import EmailFilterLog
from app.models.integrations.integration import Integration
from app.models.leases.rent_receipt_sequence import (  # noqa: F401 — registers the table on Base.metadata so conftest's create_all builds it
    RentReceiptSequence,
)
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.inquiries import inquiry_repo
from app.services.email import app_sent_email_service
from app.services.email.constants import APP_SENT_RECEIPT_FILTER_REASON
from app.services.leases import receipt_service


class _NoOpStorage:
    bucket = "mock-bucket"

    def upload_file(self, key: str, content: bytes, content_type: str) -> str:
        return key

    def delete_file(self, key: str) -> None:
        pass


@pytest.fixture
def patch_session(monkeypatch: pytest.MonkeyPatch, db: AsyncSession):
    @asynccontextmanager
    async def _factory():
        yield db

    @asynccontextmanager
    async def _uow():
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    monkeypatch.setattr(receipt_service, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(receipt_service, "unit_of_work", _uow)
    # The app-sent recorder opens its own transaction — route it to the same
    # test session so its EmailFilterLog write is visible to assertions.
    monkeypatch.setattr(app_sent_email_service, "unit_of_work", _uow)
    monkeypatch.setattr(_storage_module, "get_storage", lambda: _NoOpStorage())
    return None


async def _seed_rent_payment(
    db: AsyncSession, *, org: Organization, user: User
) -> Transaction:
    """Attributed rent payment + tenant with an email + Gmail integration.

    Deliberately NO signed lease — the post-send attachment phase then raises
    LookupError, which is exactly the failure the send-time record must
    survive.
    """
    inquiry = await inquiry_repo.create(
        db,
        organization_id=org.id,
        user_id=user.id,
        source="direct",
        received_at=_dt.datetime.now(_dt.timezone.utc),
        inquirer_name="Andrew Le",
        inquirer_email="andrew@example.com",
    )
    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        stage="lease_signed",
        legal_name="Andrew Le",
        inquiry_id=inquiry.id,
    )
    db.add(applicant)

    integration = Integration(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        provider="gmail",
        token_expiry=_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=1),
        metadata_={
            "scopes": [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
            ],
        },
    )
    integration.access_token = "tok"
    integration.refresh_token = "rt"
    db.add(integration)

    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        transaction_date=_dt.date(2026, 7, 1),
        tax_year=2026,
        amount=Decimal("1500.00"),
        transaction_type="income",
        category="rental_revenue",
        status="approved",
        is_manual=False,
        applicant_id=applicant.id,
    )
    db.add(txn)
    await db.flush()
    return txn


@pytest.mark.asyncio
async def test_send_receipt_records_app_sent_before_attachment_persistence(
    db: AsyncSession, test_user: User, test_org: Organization, patch_session,
) -> None:
    txn = await _seed_rent_payment(db, org=test_org, user=test_user)
    # Capture scalars before send_receipt: its failure path rolls back the
    # session, which expires all ORM objects — a later attribute access would
    # lazy-load from sync code and raise MissingGreenlet.
    host_email = test_user.email
    org_id = test_org.id
    user_id = test_user.id
    txn_id = txn.id

    with patch(
        "app.services.leases.receipt_service.gmail_service.send_message_with_attachment",
        new=AsyncMock(return_value="sent-gmail-msg-42"),
    ) as mock_send:
        # No signed lease exists, so the attachment phase fails AFTER the
        # email went out — the app-sent record must survive regardless.
        with pytest.raises(LookupError, match="no signed lease"):
            await receipt_service.send_receipt(
                transaction_id=txn_id,
                organization_id=org_id,
                user_id=user_id,
                period_start=_dt.date(2026, 7, 1),
                period_end=_dt.date(2026, 7, 31),
                payment_method="zelle",
            )

    assert mock_send.await_count == 1

    filter_rows = (await db.execute(select(EmailFilterLog))).scalars().all()
    assert len(filter_rows) == 1
    row = filter_rows[0]
    assert row.message_id == "sent-gmail-msg-42"
    assert row.reason == APP_SENT_RECEIPT_FILTER_REASON
    assert row.from_address == host_email
    assert row.subject is not None and row.subject.startswith("Rent receipt ")
    assert row.organization_id == org_id
    assert row.user_id == user_id
