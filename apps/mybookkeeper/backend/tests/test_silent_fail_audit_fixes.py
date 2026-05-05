"""Tests for silent-fail audit fixes (PR: fix(integrations): close silent-fail gaps).

Covers:
- gmail_service._resolve_label_id logs warning + returns None on API error
- gmail_service._resolve_label_id logs warning + returns None when label not found
- gmail_service._resolve_label_id returns the id when label exists
- email_discovery_service per-message warning includes exc_info
"""
from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest

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
            {"id": "Label_42", "name": "MyInvoices"},
            {"id": "Label_99", "name": "Other"},
        ])
        result = _resolve_label_id(service, "MyInvoices")
        assert result == "Label_42"

    def test_case_insensitive_match(self) -> None:
        service = self._make_service(labels=[{"id": "Label_42", "name": "MYINVOICES"}])
        result = _resolve_label_id(service, "myinvoices")
        assert result == "Label_42"

    def test_returns_none_and_logs_warning_when_label_not_found(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        service = self._make_service(labels=[{"id": "Label_1", "name": "SomethingElse"}])
        with caplog.at_level(logging.WARNING, logger="app.services.email.gmail_service"):
            result = _resolve_label_id(service, "MissingLabel")

        assert result is None
        assert any("MissingLabel" in r.message for r in caplog.records), (
            f"Expected warning mentioning 'MissingLabel'; got: {[r.message for r in caplog.records]}"
        )

    def test_returns_none_when_label_list_empty(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        service = self._make_service(labels=[])
        with caplog.at_level(logging.WARNING, logger="app.services.email.gmail_service"):
            result = _resolve_label_id(service, "AnyLabel")

        assert result is None

    def test_returns_none_and_logs_warning_on_api_error(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        service = self._make_service(raise_exc=Exception("network timeout"))
        with caplog.at_level(logging.WARNING, logger="app.services.email.gmail_service"):
            result = _resolve_label_id(service, "MyLabel")

        assert result is None
        records = caplog.records
        assert any(r.levelno == logging.WARNING for r in records), (
            "Expected a WARNING log record when the Gmail API raises"
        )

    def test_api_error_log_includes_exc_info(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """exc_info=True means the log record carries the exception tuple."""
        service = self._make_service(raise_exc=Exception("boom"))
        with caplog.at_level(logging.WARNING, logger="app.services.email.gmail_service"):
            _resolve_label_id(service, "MyLabel")

        warning_records = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert warning_records, "Expected at least one WARNING record"
        # When exc_info=True the record's exc_info is a 3-tuple (type, value, tb)
        has_exc_info = any(
            r.exc_info is not None and r.exc_info[0] is not None
            for r in warning_records
        )
        assert has_exc_info, (
            "Expected WARNING record to carry exc_info (exc_info=True not set on the logger.warning call)"
        )

    def test_not_found_log_does_not_carry_exc_info(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """The 'label not found' warning is informational — no exception to attach."""
        service = self._make_service(labels=[])
        with caplog.at_level(logging.WARNING, logger="app.services.email.gmail_service"):
            _resolve_label_id(service, "AnyLabel")

        warning_records = [r for r in caplog.records if r.levelno == logging.WARNING]
        # exc_info should be falsy (None or (None, None, None))
        for r in warning_records:
            assert not (r.exc_info and r.exc_info[0] is not None), (
                "Not-found warning should not carry exc_info — no exception was raised"
            )


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
                return_value=fake_service,
            ),
            patch(
                "app.services.email.email_discovery_service.email_queue_repo.get_message_ids",
                new=AsyncMock(return_value=set()),
            ),
            patch(
                "app.services.email.email_discovery_service.document_repo.get_email_message_ids",
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
