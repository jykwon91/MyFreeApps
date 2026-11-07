"""Fixtures and seed data shared by the receipt service tests.

Registered as a plugin in ``conftest.py``, so its fixtures need no import.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core import storage as _storage_module
from app.models.applicants.applicant import Applicant
from app.models.integrations.integration import Integration
from app.models.leases.signed_lease import SignedLease
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.inquiries import inquiry_repo
from app.repositories.leases import pending_rent_receipt_repo
from app.services.email import app_sent_email_service, gmail_attachment_send_service, gmail_mailbox
from app.services.leases import receipt_claim_settlement, receipt_send_service, receipt_service

PERIOD_START = _dt.date(2026, 7, 1)
PERIOD_END = _dt.date(2026, 7, 31)
# Far from any server clock, so a receipt dated this proves the client's date was used.
CLIENT_TODAY = _dt.date(2031, 3, 4)


@pytest.fixture
def receipt_sessions(monkeypatch: pytest.MonkeyPatch, _db_engine: AsyncEngine) -> None:
    """Give every service session its own session on the test engine, as in production."""

    @asynccontextmanager
    async def _factory():
        async with AsyncSession(bind=_db_engine, expire_on_commit=False) as session:
            yield session

    @asynccontextmanager
    async def _uow():
        async with AsyncSession(bind=_db_engine, expire_on_commit=False) as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    monkeypatch.setattr(receipt_send_service, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(receipt_send_service, "unit_of_work", _uow)
    monkeypatch.setattr(receipt_claim_settlement, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(receipt_claim_settlement, "unit_of_work", _uow)
    monkeypatch.setattr(receipt_service, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(receipt_service, "unit_of_work", _uow)
    monkeypatch.setattr(app_sent_email_service, "unit_of_work", _uow)
    monkeypatch.setattr(gmail_mailbox, "unit_of_work", _uow)


class RecordingStorage:
    bucket = "mock-bucket"

    def __init__(self) -> None:
        self.uploaded: list[str] = []
        self.deleted: list[str] = []
        self.fail_upload = False

    def upload_file(self, key: str, content: bytes, content_type: str) -> str:
        if self.fail_upload:
            raise ConnectionError("storage down")
        self.uploaded.append(key)
        return key

    def delete_file(self, key: str) -> None:
        self.deleted.append(key)


@pytest.fixture
def receipt_storage(monkeypatch: pytest.MonkeyPatch) -> RecordingStorage:
    recorder = RecordingStorage()
    monkeypatch.setattr(_storage_module, "get_storage", lambda: recorder)
    return recorder


@pytest.fixture
def receipt_gmail_send(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock(return_value="gmail-sent-1")
    monkeypatch.setattr(gmail_attachment_send_service, "send_message_with_attachment", mock)
    return mock


def _add_gmail(db: AsyncSession, *, org: Organization, user: User) -> None:
    integration = Integration(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        provider="gmail",
        gmail_address="host@gmail.com",
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


async def seed_receipt(
    db: AsyncSession,
    *,
    org: Organization,
    user: User,
    with_lease: bool = True,
    with_integration: bool = True,
    tenant_email: str | None = "andrew@example.com",
    attributed: bool = True,
    payer_name: str | None = None,
    vendor: str | None = None,
    payment_method: str | None = None,
) -> uuid.UUID:
    """Attributed rent payment with a queued receipt. Returns the transaction id.

    Seed a second receipt in the same org with ``with_integration=False``:
    an org has one Gmail integration.
    """
    inquiry = await inquiry_repo.create(
        db,
        organization_id=org.id,
        user_id=user.id,
        source="direct",
        received_at=_dt.datetime.now(_dt.timezone.utc),
        inquirer_name="Andrew Le",
        inquirer_email=tenant_email,
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
    if with_integration:
        _add_gmail(db, org=org, user=user)
    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        transaction_date=PERIOD_START,
        tax_year=2026,
        amount=Decimal("1500.00"),
        transaction_type="income",
        category="rental_revenue",
        status="approved",
        is_manual=False,
        applicant_id=applicant.id if attributed else None,
        payer_name=payer_name,
        vendor=vendor,
        payment_method=payment_method,
    )
    db.add(txn)
    if with_lease:
        db.add(SignedLease(
            user_id=user.id,
            organization_id=org.id,
            applicant_id=applicant.id,
            kind="imported",
            status="active",
            starts_on=_dt.date(2026, 1, 1),
            ends_on=_dt.date(2026, 12, 31),
        ))
    await db.flush()
    await pending_rent_receipt_repo.create_idempotent(
        db,
        user_id=user.id,
        organization_id=org.id,
        transaction_id=txn.id,
        applicant_id=applicant.id,
        signed_lease_id=None,
        period_start_date=PERIOD_START,
        period_end_date=PERIOD_END,
    )
    await db.commit()
    return txn.id
