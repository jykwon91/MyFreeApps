"""Integration test: discover_gmail_emails skips bounces and logs them."""

import uuid
from contextlib import asynccontextmanager
from unittest.mock import MagicMock, patch

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


def _bounce_sources_data() -> dict:
    return {
        "subject": "Mail Delivery Subsystem - delivery failure",
        "from_address": "MAILER-DAEMON@mail.example.com",
        "headers": {
            "From": "MAILER-DAEMON@mail.example.com",
            "Subject": "Mail Delivery Subsystem - delivery failure",
            "X-Failed-Recipients": "user@example.invalid",
        },
        "body_preview": "Diagnostic-Code: smtp; 550 user not found",
        "sources": [
            {
                "attachment_id": "body",
                "filename": None,
                "content_type": "text/plain",
            },
        ],
    }


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


@pytest.mark.asyncio
async def test_discovery_filters_bounce_and_logs_it(
    db: AsyncSession,
    gmail_integration: Integration,
    request_ctx: RequestContext,
) -> None:
    """A bounce email is logged in email_filter_logs and never queued for extraction."""
    bounce_msg_id = "msg_bounce_123"

    @asynccontextmanager
    async def _fake_uow():
        yield db

    with (
        patch("app.services.email.email_discovery_service.unit_of_work", _fake_uow),
        patch("app.services.email.email_discovery_service.get_gmail_service") as mock_gmail,
        patch(
            "app.services.email.email_discovery_service.list_new_email_ids",
            return_value=[bounce_msg_id],
        ),
        patch(
            "app.services.email.email_discovery_service.list_email_document_sources",
            return_value=_bounce_sources_data(),
        ),
    ):
        mock_gmail.return_value = MagicMock()

        from app.services.email.email_discovery_service import discover_gmail_emails

        result = await discover_gmail_emails(request_ctx)

    # Bounce was filtered — no queue items created.
    queue_rows = (await db.execute(select(EmailQueue))).scalars().all()
    assert len(queue_rows) == 0, "bounce email should not be queued"

    # And a filter log row should exist.
    filter_rows = (await db.execute(select(EmailFilterLog))).scalars().all()
    assert len(filter_rows) == 1
    log_row = filter_rows[0]
    assert log_row.message_id == bounce_msg_id
    assert log_row.from_address == "MAILER-DAEMON@mail.example.com"
    assert log_row.subject == "Mail Delivery Subsystem - delivery failure"
    # X-Failed-Recipients fires before the subject rule (cheaper check).
    assert log_row.reason == "header_x_failed_recipients"
    assert log_row.organization_id == request_ctx.organization_id
    assert log_row.user_id == request_ctx.user_id

    # The discovery flow saw "nothing new to queue" because the only msg was filtered.
    assert result.status == "nothing_new"


@pytest.mark.asyncio
async def test_discovery_queues_legit_email_alongside_filtered_bounce(
    db: AsyncSession,
    gmail_integration: Integration,
    request_ctx: RequestContext,
) -> None:
    """A real invoice goes to the queue while a bounce gets logged separately."""
    bounce_msg_id = "msg_bounce_a"
    legit_msg_id = "msg_legit_b"

    def fake_list_sources(_service, message_id):  # type: ignore[no-untyped-def]
        if message_id == bounce_msg_id:
            return _bounce_sources_data()
        return _legit_sources_data()

    @asynccontextmanager
    async def _fake_uow():
        yield db

    with (
        patch("app.services.email.email_discovery_service.unit_of_work", _fake_uow),
        patch("app.services.email.email_discovery_service.get_gmail_service") as mock_gmail,
        patch(
            "app.services.email.email_discovery_service.list_new_email_ids",
            return_value=[bounce_msg_id, legit_msg_id],
        ),
        patch(
            "app.services.email.email_discovery_service.list_email_document_sources",
            side_effect=fake_list_sources,
        ),
    ):
        mock_gmail.return_value = MagicMock()

        from app.services.email.email_discovery_service import discover_gmail_emails

        result = await discover_gmail_emails(request_ctx)

    queue_rows = (await db.execute(select(EmailQueue))).scalars().all()
    assert len(queue_rows) == 1, "only the legit email should be queued"
    assert queue_rows[0].message_id == legit_msg_id
    assert queue_rows[0].attachment_id == "att_pdf_1"

    filter_rows = (await db.execute(select(EmailFilterLog))).scalars().all()
    assert len(filter_rows) == 1
    assert filter_rows[0].message_id == bounce_msg_id

    assert result.status == "queued"
    assert result.count == 1


@pytest.mark.asyncio
async def test_discovery_does_not_call_extraction_for_filtered_bounce(
    db: AsyncSession,
    gmail_integration: Integration,
    request_ctx: RequestContext,
) -> None:
    """Bounce filtering happens before any Claude extraction call.

    Regression guard: the whole point of this feature is to never send
    bounces to Anthropic. We assert that no extraction-side functions are
    invoked during a bounce-only sync.
    """
    bounce_msg_id = "msg_bounce_x"

    @asynccontextmanager
    async def _fake_uow():
        yield db

    # Patch every extraction-facing function so we can assert they never run.
    with (
        patch("app.services.email.email_discovery_service.unit_of_work", _fake_uow),
        patch("app.services.email.email_discovery_service.get_gmail_service") as mock_gmail,
        patch(
            "app.services.email.email_discovery_service.list_new_email_ids",
            return_value=[bounce_msg_id],
        ),
        patch(
            "app.services.email.email_discovery_service.list_email_document_sources",
            return_value=_bounce_sources_data(),
        ),
        patch(
            "app.services.extraction.claude_service.extract_from_email"
        ) as mock_extract_email,
        patch(
            "app.services.extraction.claude_service.extract_from_text"
        ) as mock_extract_text,
        patch(
            "app.services.extraction.claude_service.extract_from_image"
        ) as mock_extract_image,
    ):
        mock_gmail.return_value = MagicMock()

        from app.services.email.email_discovery_service import discover_gmail_emails

        await discover_gmail_emails(request_ctx)

    mock_extract_email.assert_not_called()
    mock_extract_text.assert_not_called()
    mock_extract_image.assert_not_called()
