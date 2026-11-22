"""Gmail sync logs must identify messages by id, never by sender or subject.

INFO log lines become Sentry breadcrumbs, so a sender address or subject
(tenant names, personal details) must not appear in any log record.
"""
import json
import logging
import uuid
from contextlib import ExitStack
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.context import RequestContext
from app.models.email.bounce_detection_result import BounceDetectionResult
from app.models.email.claimed_queue_item import ClaimedQueueItem
from app.models.organization.organization_member import OrgRole
from app.services.email import email_extraction_service as extraction
from app.services.email.gmail_service import list_new_email_ids
from tests.test_email_discovery_last_synced import _make_ctx, _make_integration, _patch_discovery_dependencies

SENDER = "tenant.jane.doe@example.com"
FILENAME = "Jane_Doe_lease_42_Elm_Street.pdf"
SUBJECT = "Jane Doe lease renewal for 42 Elm Street"


def _assert_no_personal_details(caplog: pytest.LogCaptureFixture) -> None:
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert SENDER not in text
    assert SUBJECT not in text
    assert FILENAME not in text
    assert "Jane Doe" not in text


def test_search_makes_no_per_message_call_and_logs_no_headers(caplog: pytest.LogCaptureFixture) -> None:
    service = MagicMock()
    service.users().messages().list().execute.return_value = {"messages": [{"id": "m1"}, {"id": "m2"}]}
    service.users().messages().get.reset_mock()
    service.users().messages().get().execute.return_value = {
        "payload": {"headers": [{"name": "From", "value": SENDER}, {"name": "Subject", "value": SUBJECT}]},
    }
    service.users().messages().get.reset_mock()

    with caplog.at_level(logging.DEBUG):
        new_ids, total = list_new_email_ids(service, set())

    assert (new_ids, total) == (["m1", "m2"], 2)
    service.users().messages().get.assert_not_called()
    _assert_no_personal_details(caplog)


@pytest.mark.asyncio
async def test_bounce_filter_log_names_the_message_id_not_sender_or_subject(
    caplog: pytest.LogCaptureFixture,
) -> None:
    ctx = _make_ctx()
    sources = {
        "from_address": SENDER, "subject": SUBJECT, "sources": [],
    }
    patches, _ = _patch_discovery_dependencies(
        integration=_make_integration(), new_ids=["gmail-msg-77"], sources_data=sources,
    )
    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        stack.enter_context(patch(
            "app.services.email.email_discovery_service._detect_bounce",
            return_value=BounceDetectionResult(filtered=True, reason="subject"),
        ))
        stack.enter_context(patch(
            "app.services.email.email_discovery_service.email_filter_log_repo.insert_ignore_conflict",
            new=AsyncMock(),
        ))
        stack.enter_context(patch(
            "app.services.email.email_discovery_service.sync_log_repo.create",
            new=AsyncMock(return_value=MagicMock(id=1)),
        ))
        stack.enter_context(patch(
            "app.services.email.email_discovery_service.sync_log_repo.mark_completed", new=AsyncMock(),
        ))
        stack.enter_context(patch(
            "app.services.email.email_discovery_service.integration_repo.update_last_synced", new=AsyncMock(),
        ))
        from app.services.email.email_discovery_service import discover_gmail_emails

        with caplog.at_level(logging.DEBUG):
            await discover_gmail_emails(ctx)

    _assert_no_personal_details(caplog)
    assert "gmail-msg-77" in caplog.text


@pytest.mark.asyncio
async def test_body_extraction_log_names_the_queue_row_not_the_subject(
    caplog: pytest.LogCaptureFixture,
) -> None:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    row_id = uuid.uuid4()
    claimed = ClaimedQueueItem(
        id=row_id, message_id="gmail-msg-88", sync_log_id=1, attachment_id="body",
        attachment_filename=None, attachment_content_type=None, email_subject=SUBJECT,
        raw_content=None, fetched_on=date(2026, 1, 1), attempts=1,
        claimed_at=datetime.now(timezone.utc),
    )
    raw = json.dumps({"subject": SUBJECT, "body": "hi", "from_address": SENDER}).encode()

    class _Stop(Exception):
        pass

    with patch.object(extraction, "ingest_booking_email", new=AsyncMock(side_effect=_Stop)):
        with caplog.at_level(logging.DEBUG), pytest.raises(_Stop):
            await extraction._extract_claimed(ctx, claimed, raw)

    _assert_no_personal_details(caplog)
    assert str(row_id) in caplog.text


@pytest.mark.asyncio
async def test_attachment_extraction_log_names_the_queue_row_not_the_filename(
    caplog: pytest.LogCaptureFixture,
) -> None:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    row_id = uuid.uuid4()
    claimed = ClaimedQueueItem(
        id=row_id, message_id="gmail-msg-99", sync_log_id=1, attachment_id="att-1",
        attachment_filename=FILENAME, attachment_content_type="application/pdf", email_subject=SUBJECT,
        raw_content=None, fetched_on=date(2026, 1, 1), attempts=1,
        claimed_at=datetime.now(timezone.utc),
    )

    class _Stop(Exception):
        pass

    with patch.object(extraction, "_extract_from_attachment", new=MagicMock(side_effect=_Stop)):
        with caplog.at_level(logging.DEBUG), pytest.raises(_Stop):
            await extraction._extract_claimed(ctx, claimed, b"%PDF")

    _assert_no_personal_details(caplog)
    assert str(row_id) in caplog.text
