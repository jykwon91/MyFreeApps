"""App-sent emails must never re-enter the Gmail ingestion pipeline.

MBK sends rent receipts / inquiry replies through the SAME Gmail account it
ingests from. A sent rent receipt matches the ingestion query
(``subject:receipt`` + ``has:attachment``), so without the send-time record
in ``email_filter_logs`` the next sync would re-extract the app's own
receipt as a duplicate income transaction under the tenant's name — which
the payer-keyed dedup cannot match against the original Zelle notification
when someone else (spouse, family member) sent the money.

The exclusion is keyed on the exact Gmail message ID recorded at send time —
NOT on from-address or subject shape — so emails the user forwards to
themselves keep flowing into ingestion.
"""

import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.email.email_filter_log import EmailFilterLog
from app.models.email.email_queue import EmailQueue
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories import email_filter_log_repo
from app.services.email import app_sent_email_service
from app.services.email.constants import (
    APP_SENT_RECEIPT_FILTER_REASON,
    EMAIL_FILTER_LOG_SUBJECT_MAX_LEN,
)


@pytest.fixture()
async def gmail_integration(
    db: AsyncSession, test_org: Organization, test_user: User
) -> Integration:
    integration = Integration(
        organization_id=test_org.id,
        user_id=test_user.id,
        provider="gmail",
    )
    integration.access_token = "fake_access_token"
    integration.refresh_token = "fake_refresh_token"
    db.add(integration)
    await db.commit()
    await db.refresh(integration)
    return integration


@pytest.fixture()
def request_ctx(test_org: Organization, test_user: User) -> RequestContext:
    return RequestContext(
        organization_id=test_org.id,
        user_id=test_user.id,
        org_role=OrgRole.OWNER,
    )


def _legit_sources_data() -> dict:
    return {
        "subject": "Invoice 4567 - Service on April 15",
        "from_address": "Acme Plumbing <billing@acme.example>",
        "headers": {
            "From": "Acme Plumbing <billing@acme.example>",
            "Subject": "Invoice 4567 - Service on April 15",
        },
        "body_preview": "Thanks for your business! Total: $123.45",
        "sources": [
            {
                "attachment_id": "att_pdf_1",
                "filename": "invoice_4567.pdf",
                "content_type": "application/pdf",
            },
        ],
    }


def _fake_gmail_service(message_ids: list[str]) -> MagicMock:
    """A Gmail API client whose search returns ``message_ids``."""
    service = MagicMock()
    messages = service.users.return_value.messages.return_value
    messages.list.return_value.execute.return_value = {
        "messages": [{"id": mid} for mid in message_ids],
    }
    # Metadata fetch used only for the discovery diagnostic log.
    messages.get.return_value.execute.return_value = {
        "payload": {"headers": [{"name": "Subject", "value": "s"}, {"name": "From", "value": "f"}]},
    }
    return service


@pytest.mark.asyncio
async def test_discovery_excludes_app_sent_message_ids(
    db: AsyncSession,
    gmail_integration: Integration,
    request_ctx: RequestContext,
) -> None:
    """A send-time-recorded message ID is dropped by the REAL list_new_email_ids
    exclusion (not a patched one); other mail keeps flowing."""
    sent_receipt_id = "msg_receipt_sent_by_app"
    legit_id = "msg_new_invoice"

    await email_filter_log_repo.insert_ignore_conflict(
        db,
        organization_id=request_ctx.organization_id,
        user_id=request_ctx.user_id,
        message_id=sent_receipt_id,
        from_address="host@example.com",
        subject="Rent receipt RCPT-2026-0001 — July 1–31, 2026 — 6734 Peerless St",
        reason=APP_SENT_RECEIPT_FILTER_REASON,
    )
    await db.commit()

    @asynccontextmanager
    async def _fake_uow():
        yield db

    with (
        patch("app.services.email.email_discovery_service.unit_of_work", _fake_uow),
        patch("app.services.email.email_discovery_service.get_gmail_service") as mock_gmail,
        patch(
            "app.services.email.email_discovery_service.list_email_document_sources",
            return_value=_legit_sources_data(),
        ) as mock_sources,
    ):
        # Gmail returns BOTH messages — the app-sent one must be excluded
        # client-side via the processed_ids set.
        mock_gmail.return_value = (
            _fake_gmail_service([sent_receipt_id, legit_id]),
            MagicMock(token="t0"),
        )

        from app.services.email.email_discovery_service import discover_gmail_emails

        result = await discover_gmail_emails(request_ctx)

    queue_rows = (await db.execute(select(EmailQueue))).scalars().all()
    assert [row.message_id for row in queue_rows] == [legit_id]
    # The app-sent message never even had its sources fetched.
    fetched_ids = [call.args[1] for call in mock_sources.call_args_list]
    assert sent_receipt_id not in fetched_ids

    assert result.status == "queued"
    assert result.count == 1


@pytest.mark.asyncio
async def test_record_app_sent_email_inserts_filter_log_row(
    db: AsyncSession, test_org: Organization, test_user: User, monkeypatch,
) -> None:
    @asynccontextmanager
    async def _uow():
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    monkeypatch.setattr(app_sent_email_service, "unit_of_work", _uow)

    long_subject = "Rent receipt " + "x" * 600
    await app_sent_email_service.record_app_sent_email(
        organization_id=test_org.id,
        user_id=test_user.id,
        message_id="sent-msg-1",
        from_address="host@example.com",
        subject=long_subject,
        reason=APP_SENT_RECEIPT_FILTER_REASON,
    )

    rows = (await db.execute(select(EmailFilterLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].message_id == "sent-msg-1"
    assert rows[0].reason == APP_SENT_RECEIPT_FILTER_REASON
    assert rows[0].from_address == "host@example.com"
    assert rows[0].subject == long_subject[:EMAIL_FILTER_LOG_SUBJECT_MAX_LEN]
    assert rows[0].organization_id == test_org.id
    assert rows[0].user_id == test_user.id


@pytest.mark.asyncio
async def test_record_app_sent_email_is_idempotent(
    db: AsyncSession, test_org: Organization, test_user: User, monkeypatch,
) -> None:
    """Re-recording the same message ID (e.g. a retried flow) keeps one row."""
    @asynccontextmanager
    async def _uow():
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    monkeypatch.setattr(app_sent_email_service, "unit_of_work", _uow)

    for _ in range(2):
        await app_sent_email_service.record_app_sent_email(
            organization_id=test_org.id,
            user_id=test_user.id,
            message_id="sent-msg-dup",
            from_address=None,
            subject=None,
            reason=APP_SENT_RECEIPT_FILTER_REASON,
        )

    rows = (await db.execute(select(EmailFilterLog))).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_record_app_sent_email_never_raises(
    db: AsyncSession, test_org: Organization, test_user: User, monkeypatch,
) -> None:
    """The email already went out — a recording failure must not fail the
    caller's send flow (retrying would send a duplicate email)."""
    @asynccontextmanager
    async def _uow():
        yield db

    monkeypatch.setattr(app_sent_email_service, "unit_of_work", _uow)

    with patch(
        "app.services.email.app_sent_email_service.email_filter_log_repo.insert_ignore_conflict",
        new=AsyncMock(side_effect=RuntimeError("db down")),
    ):
        await app_sent_email_service.record_app_sent_email(
            organization_id=test_org.id,
            user_id=test_user.id,
            message_id="sent-msg-err",
            from_address=None,
            subject=None,
            reason=APP_SENT_RECEIPT_FILTER_REASON,
        )
    # reaching here without an exception is the assertion


@pytest.mark.asyncio
async def test_bounce_filtered_ids_also_excluded_from_relisting(
    db: AsyncSession,
    gmail_integration: Integration,
    request_ctx: RequestContext,
) -> None:
    """Any filter-logged message (bounce or app-sent) is permanently excluded —
    a previously filtered bounce is not re-fetched every sync."""
    bounce_id = "msg_bounce_old"
    await email_filter_log_repo.insert_ignore_conflict(
        db,
        organization_id=request_ctx.organization_id,
        user_id=request_ctx.user_id,
        message_id=bounce_id,
        from_address="MAILER-DAEMON@mail.example.com",
        subject="Undeliverable",
        reason="header_x_failed_recipients",
    )
    await db.commit()

    @asynccontextmanager
    async def _fake_uow():
        yield db

    with (
        patch("app.services.email.email_discovery_service.unit_of_work", _fake_uow),
        patch("app.services.email.email_discovery_service.get_gmail_service") as mock_gmail,
        patch(
            "app.services.email.email_discovery_service.list_email_document_sources",
        ) as mock_sources,
    ):
        mock_gmail.return_value = (
            _fake_gmail_service([bounce_id]),
            MagicMock(token="t0"),
        )

        from app.services.email.email_discovery_service import discover_gmail_emails

        result = await discover_gmail_emails(request_ctx)

    assert result.status == "nothing_new"
    mock_sources.assert_not_called()
