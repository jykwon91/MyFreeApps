"""Fixtures and seed data shared by the inquiry reply send tests.

Registered as a plugin in ``conftest.py``, so its fixtures need no import.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.inquiries import inquiry_repo
from app.schemas.inquiries.inquiry_reply_request import InquiryReplyRequest
from app.services.email import app_sent_email_service, gmail_mailbox, gmail_sent_lookup, gmail_service
from app.services.email.constants import GMAIL_SEND_CLAIM_STALE_AFTER
from app.services.inquiries import (
    inquiry_reply_service,
    reply_claim_settlement,
    reply_recording,
)


@pytest.fixture
def reply_sessions(monkeypatch: pytest.MonkeyPatch, _db_engine: AsyncEngine) -> None:
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

    monkeypatch.setattr(inquiry_reply_service, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(inquiry_reply_service, "unit_of_work", _uow)
    monkeypatch.setattr(reply_recording, "AsyncSessionLocal", _factory)
    monkeypatch.setattr(reply_recording, "unit_of_work", _uow)
    monkeypatch.setattr(reply_claim_settlement, "unit_of_work", _uow)
    monkeypatch.setattr(app_sent_email_service, "unit_of_work", _uow)
    monkeypatch.setattr(gmail_mailbox, "unit_of_work", _uow)


@pytest.fixture
def reply_gmail_send(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock(return_value="gmail-sent-1")
    monkeypatch.setattr(gmail_service, "send_message", mock)
    return mock


@pytest.fixture
def reply_gmail_find(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    mock = AsyncMock(return_value=None)
    monkeypatch.setattr(gmail_sent_lookup, "find_by_message_id_header", mock)
    return mock


async def seed_inquiry(db: AsyncSession, org: Organization, user: User, *, with_gmail: bool = True) -> Inquiry:
    if with_gmail:
        integration = Integration(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=user.id,
            provider="gmail",
            gmail_address="host@gmail.com",
            token_expiry=_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=1),
            metadata_={"scopes": [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
            ]},
        )
        integration.access_token = "tok"
        integration.refresh_token = "rt"
        db.add(integration)
    inquiry = await inquiry_repo.create(
        db,
        organization_id=org.id,
        user_id=user.id,
        source="direct",
        received_at=_dt.datetime.now(_dt.timezone.utc),
        inquirer_name="Alice",
        inquirer_email="alice@example.com",
    )
    await db.commit()
    return inquiry


def reply_request(key: uuid.UUID | None, body: str = "Hi Alice") -> InquiryReplyRequest:
    return InquiryReplyRequest(subject="Re: Cozy Room", body=body, client_request_id=key)


async def send_reply(org: Organization, user: User, inquiry: Inquiry, request: InquiryReplyRequest):  # type: ignore[no-untyped-def]
    return await inquiry_reply_service.send_reply(org.id, user.id, inquiry.id, request)


async def reply_claims(db: AsyncSession) -> list[InquiryReplySend]:
    return list((await db.execute(
        select(InquiryReplySend).execution_options(populate_existing=True),
    )).scalars().all())


async def age_reply_claims(db: AsyncSession) -> None:
    old = _dt.datetime.now(_dt.timezone.utc) - GMAIL_SEND_CLAIM_STALE_AFTER - _dt.timedelta(minutes=1)
    await db.execute(update(InquiryReplySend).values(claimed_at=old))
    await db.commit()
