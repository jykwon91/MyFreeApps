"""Tests for silent-fail audit fixes (PR: fix(integrations): close silent-fail gaps).

Covers:
- gmail_service._resolve_label_id returns the id when the label exists, raises
  GmailLabelNotFoundError when it doesn't, and lets API errors propagate
- email_discovery_service per-message warning includes exc_info
"""
from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest

from app.services.email.exceptions import GmailLabelNotFoundError
from app.services.email.gmail_service import _resolve_label_id


# ---------------------------------------------------------------------------
# _resolve_label_id
# ---------------------------------------------------------------------------

class TestResolveLabelId:
    def _make_service(self, labels: list[dict] | None = None, raise_exc: Exception | None = None) -> MagicMock:
        """Build a minimal Gmail service mock for label list calls."""
        service = MagicMock()
        list_call = service.users.return_value.labels.return_value.list.return_value
        if raise_exc is not None:
            list_call.execute.side_effect = raise_exc
        else:
            list_call.execute.return_value = {"labels": labels or []}
        return service

    def test_returns_id_when_label_found(self) -> None:
        service = self._make_service(labels=[
            {"id": "Label_1", "name": "Other"},
            {"id": "Label_42", "name": "MyInvoices"},
        ])
        assert _resolve_label_id(service, "MyInvoices") == "Label_42"

    def test_label_match_is_case_insensitive(self) -> None:
        service = self._make_service(labels=[{"id": "Label_42", "name": "MYINVOICES"}])
        assert _resolve_label_id(service, "myinvoices") == "Label_42"

    @pytest.mark.parametrize("labels", [[{"id": "Label_1", "name": "SomethingElse"}], []])
    def test_raises_when_label_not_found(self, labels: list[dict]) -> None:
        service = self._make_service(labels=labels)
        with pytest.raises(GmailLabelNotFoundError) as caught:
            _resolve_label_id(service, "MissingLabel")
        assert caught.value.label == "MissingLabel"

    def test_api_error_is_not_swallowed(self) -> None:
        service = self._make_service(raise_exc=RuntimeError("network timeout"))
        with pytest.raises(RuntimeError, match="network timeout"):
            _resolve_label_id(service, "MyLabel")


# ---------------------------------------------------------------------------
# email_discovery_service — per-message warning includes exc_info
# ---------------------------------------------------------------------------

class TestEmailDiscoveryServiceExcInfo:
    """Verify that the per-message 'skipping' warning carries exc_info=True.

    We test this by importing the logger used inside email_discovery_service
    and asserting the log record has exc_info attached when an exception
    bubbles up from list_email_document_sources.
    """

    @pytest.mark.anyio
    async def test_per_message_warning_carries_exc_info(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """When list_email_document_sources raises a generic Exception,
        the warning log should carry exc_info so the traceback is preserved."""
        from unittest.mock import AsyncMock, MagicMock, patch

        # Minimal stubs so discover_gmail_emails can be called without a real DB
        mock_integration = MagicMock()
        mock_integration.access_token = "token"
        mock_integration.refresh_token = "refresh"

        # Patch unit_of_work to yield a session that returns our stubs
        mock_db = AsyncMock()

        import asyncio
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def _fake_uow():
            yield mock_db

        fake_service = MagicMock()
        boom = Exception("fetch failed")

        with (
            patch("app.services.email.email_discovery_service.unit_of_work", _fake_uow),
            patch(
                "app.services.email.email_discovery_service.integration_repo.get_by_org_and_provider",
                new=AsyncMock(return_value=mock_integration),
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
                return_value=(fake_service, MagicMock(token="t0")),
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
            # list_new_email_ids returns one new ID so we enter the per-message loop
            patch(
                "app.services.email.email_discovery_service.list_new_email_ids",
                return_value=(["msg-001"], 1),
            ),
            # list_email_document_sources raises, triggering the warning
            patch(
                "app.services.email.email_discovery_service.list_email_document_sources",
                side_effect=boom,
            ),
            patch(
                "app.services.email.email_discovery_service.gmail_skipped_message_repo.record_skip",
                new=AsyncMock(),
            ),
            patch(
                "app.services.email.email_discovery_service.sync_log_repo.create",
                new=AsyncMock(return_value=MagicMock(id=1)),
            ),
            patch(
                "app.services.email.email_discovery_service.sync_log_repo.mark_completed",
                new=AsyncMock(),
            ),
            patch(
                "app.services.email.email_discovery_service.integration_repo.update_last_synced",
                new=AsyncMock(),
            ),
        ):
            from app.services.email.email_discovery_service import discover_gmail_emails
            from app.core.context import worker_context
            import uuid

            ctx = worker_context(
                organization_id=uuid.uuid4(),
                user_id=uuid.uuid4(),
            )

            with caplog.at_level(logging.WARNING, logger="app.services.email.email_discovery_service"):
                await discover_gmail_emails(ctx)

        warning_records = [
            r for r in caplog.records
            if r.levelno == logging.WARNING and "msg-001" in r.message
        ]
        assert warning_records, (
            f"Expected a WARNING about msg-001; got records: {[r.message for r in caplog.records]}"
        )
        has_exc_info = any(
            r.exc_info is not None and r.exc_info[0] is not None
            for r in warning_records
        )
        assert has_exc_info, (
            "Per-message 'skipping' warning must carry exc_info=True so the traceback is preserved in logs"
        )
