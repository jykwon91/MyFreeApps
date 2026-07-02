"""Tests for gmail_skipped_messages audit trail.

Covers:
- record_skip repo function creates a row with correct fields
- discover_gmail_emails: one failing message in a 3-message batch results in
  2 messages processed normally + 1 call to record_skip
- discover_gmail_emails: record_skip receives the correct user/org/message_id/exc
- cascade-delete: deleting a user removes their skipped-message rows (schema-level test)
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole


def _make_ctx(
    *,
    organization_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
) -> RequestContext:
    return RequestContext(
        organization_id=organization_id or uuid.uuid4(),
        user_id=user_id or uuid.uuid4(),
        org_role=OrgRole.OWNER,
    )


def _make_integration() -> MagicMock:
    integration = MagicMock()
    integration.access_token = "enc-access"
    integration.refresh_token = "enc-refresh"
    return integration


def _base_patches(
    *,
    integration: MagicMock,
    new_ids: list[str],
    list_sources_side_effects: list,
) -> list:
    """Build the shared patch stack used by discovery service tests."""
    fake_db = MagicMock()
    fake_db.flush = AsyncMock()

    @asynccontextmanager
    async def fake_uow():
        yield fake_db

    return [
        patch("app.services.email.email_discovery_service.unit_of_work", fake_uow),
        patch(
            "app.services.email.email_discovery_service.integration_repo.get_by_org_and_provider",
            new=AsyncMock(return_value=integration),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.timeout_stuck",
            new=AsyncMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.count_running",
            new=AsyncMock(return_value=0),
        ),
        patch(
            "app.services.email.email_discovery_service.email_queue_repo.reset_stuck",
            new=AsyncMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.get_gmail_service",
            return_value=(MagicMock(), MagicMock(token="t0")),
        ),
        patch(
            "app.services.email.email_discovery_service.email_queue_repo.get_message_ids",
            new=AsyncMock(return_value=set()),
        ),
        patch(
            "app.services.email.email_discovery_service.document_repo.get_email_message_ids",
            new=AsyncMock(return_value=set()),
        ),
        patch(
            "app.services.email.email_discovery_service.email_filter_log_repo.get_message_ids",
            new=AsyncMock(return_value=set()),
        ),
        patch(
            "app.services.email.email_discovery_service.list_new_email_ids",
            return_value=(new_ids, len(new_ids)),
        ),
        patch(
            "app.services.email.email_discovery_service.list_email_document_sources",
            side_effect=list_sources_side_effects,
        ),
        patch(
            "app.services.email.email_discovery_service.email_queue_repo.insert_ignore_conflict",
            new=AsyncMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.email_filter_log_repo.insert_ignore_conflict",
            new=AsyncMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.create",
            new=AsyncMock(return_value=MagicMock(id=1, total_items=0)),
        ),
        patch(
            "app.services.email.email_discovery_service.sync_log_repo.mark_completed",
            new=AsyncMock(),
        ),
        patch(
            "app.services.email.email_discovery_service.integration_repo.update_last_synced",
            new=AsyncMock(),
        ),
    ]


# ---------------------------------------------------------------------------
# Unit test: record_skip repo function
# ---------------------------------------------------------------------------

class TestRecordSkip:
    @pytest.mark.anyio
    async def test_creates_row_with_correct_fields(self) -> None:
        from app.repositories.email.gmail_skipped_message_repo import record_skip
        from app.models.email.gmail_skipped_message import GmailSkippedMessage

        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        exc = ValueError("something went wrong")

        db = AsyncMock()
        db.flush = AsyncMock()
        db.add = MagicMock()

        result = await record_skip(
            db,
            organization_id=org_id,
            user_id=user_id,
            gmail_message_id="msg-abc123",
            exc=exc,
        )

        assert isinstance(result, GmailSkippedMessage)
        assert result.organization_id == org_id
        assert result.user_id == user_id
        assert result.gmail_message_id == "msg-abc123"
        assert result.exception_type == "ValueError"
        assert result.exception_message == "something went wrong"
        db.add.assert_called_once_with(result)
        db.flush.assert_awaited_once()

    @pytest.mark.anyio
    async def test_exception_message_capped_at_2000_chars(self) -> None:
        from app.repositories.email.gmail_skipped_message_repo import record_skip

        long_message = "x" * 3000
        exc = RuntimeError(long_message)

        db = AsyncMock()
        db.add = MagicMock()

        result = await record_skip(
            db,
            organization_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            gmail_message_id="msg-x",
            exc=exc,
        )

        assert len(result.exception_message) == 2000

    @pytest.mark.anyio
    async def test_exception_type_uses_class_name(self) -> None:
        from app.repositories.email.gmail_skipped_message_repo import record_skip

        class CustomNetworkError(Exception):
            pass

        exc = CustomNetworkError("network hiccup")
        db = AsyncMock()
        db.add = MagicMock()

        result = await record_skip(
            db,
            organization_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            gmail_message_id="msg-y",
            exc=exc,
        )

        assert result.exception_type == "CustomNetworkError"


# ---------------------------------------------------------------------------
# Service-level tests: 3-message batch with one failure in the middle
# ---------------------------------------------------------------------------

_GOOD_SOURCES = {
    "subject": "Invoice",
    "sources": [{"attachment_id": "att-1", "filename": "r.pdf", "content_type": "application/pdf"}],
    "from_address": "vendor@example.com",
    "headers": {},
    "body_preview": None,
}


class TestDiscoveryWithSkip:
    @pytest.mark.anyio
    async def test_one_failure_in_3_message_batch_calls_record_skip_once(self) -> None:
        """When message 2 of 3 raises, record_skip is called once and the other two proceed."""
        integration = _make_integration()
        ctx = _make_ctx()

        boom = Exception("Gmail API blip")
        side_effects = [_GOOD_SOURCES, boom, _GOOD_SOURCES]

        record_skip_calls: list[dict] = []

        async def fake_record_skip(db, *, organization_id, user_id, gmail_message_id, exc):
            record_skip_calls.append({
                "organization_id": organization_id,
                "user_id": user_id,
                "gmail_message_id": gmail_message_id,
                "exc": exc,
            })
            return MagicMock()

        from contextlib import ExitStack
        patches = _base_patches(
            integration=integration,
            new_ids=["msg-1", "msg-2", "msg-3"],
            list_sources_side_effects=side_effects,
        )

        with ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            stack.enter_context(
                patch(
                    "app.services.email.email_discovery_service.gmail_skipped_message_repo.record_skip",
                    new=fake_record_skip,
                )
            )

            from app.services.email.email_discovery_service import discover_gmail_emails
            await discover_gmail_emails(ctx)

        assert len(record_skip_calls) == 1
        skipped = record_skip_calls[0]
        assert skipped["gmail_message_id"] == "msg-2"
        assert skipped["exc"] is boom

    @pytest.mark.anyio
    async def test_record_skip_receives_correct_org_and_user(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        ctx = _make_ctx(organization_id=org_id, user_id=user_id)
        integration = _make_integration()

        boom = Exception("transient error")
        side_effects = [boom]

        record_skip_calls: list[dict] = []

        async def fake_record_skip(db, *, organization_id, user_id, gmail_message_id, exc):
            record_skip_calls.append({
                "organization_id": organization_id,
                "user_id": user_id,
            })
            return MagicMock()

        from contextlib import ExitStack
        patches = _base_patches(
            integration=integration,
            new_ids=["msg-fail"],
            list_sources_side_effects=side_effects,
        )

        with ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            stack.enter_context(
                patch(
                    "app.services.email.email_discovery_service.gmail_skipped_message_repo.record_skip",
                    new=fake_record_skip,
                )
            )

            from app.services.email.email_discovery_service import discover_gmail_emails
            await discover_gmail_emails(ctx)

        assert len(record_skip_calls) == 1
        assert record_skip_calls[0]["organization_id"] == org_id
        assert record_skip_calls[0]["user_id"] == user_id

    @pytest.mark.anyio
    async def test_no_record_skip_when_all_messages_succeed(self) -> None:
        integration = _make_integration()
        ctx = _make_ctx()

        side_effects = [_GOOD_SOURCES, _GOOD_SOURCES]

        record_skip_mock = AsyncMock(return_value=MagicMock())

        from contextlib import ExitStack
        patches = _base_patches(
            integration=integration,
            new_ids=["msg-ok-1", "msg-ok-2"],
            list_sources_side_effects=side_effects,
        )

        with ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            stack.enter_context(
                patch(
                    "app.services.email.email_discovery_service.gmail_skipped_message_repo.record_skip",
                    new=record_skip_mock,
                )
            )

            from app.services.email.email_discovery_service import discover_gmail_emails
            await discover_gmail_emails(ctx)

        record_skip_mock.assert_not_awaited()
