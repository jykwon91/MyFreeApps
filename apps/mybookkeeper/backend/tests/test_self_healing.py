"""Tests for self-healing infrastructure: retry logic, throttle state, event recording, health summary."""
import asyncio
import time
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx2
import pytest
from platform_shared.extraction import ExtractionParseError, ExtractionTruncatedError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import system_event_repo
from app.services.extraction.claude_retry_policy import is_retryable_extraction_error


def _is_transient(exc: Exception) -> bool:
    """The upload worker's (and email queue's) retry decision."""
    return is_retryable_extraction_error(exc)


class TestSystemEventRepo:
    @pytest.mark.asyncio
    async def test_record_event(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        event = await system_event_repo.record(
            db, test_org.id, "extraction_failed", "error",
            "Document failed extraction", {"document_id": "abc"},
        )
        await db.commit()
        assert event.id is not None
        assert event.event_type == "extraction_failed"
        assert event.severity == "error"
        assert event.resolved is False

    @pytest.mark.asyncio
    async def test_list_unresolved(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await system_event_repo.record(db, test_org.id, "extraction_failed", "error", "fail 1")
        await system_event_repo.record(db, test_org.id, "rate_limited", "warning", "rate limit")
        resolved_event = await system_event_repo.record(db, test_org.id, "extraction_failed", "error", "fail resolved")
        resolved_event.resolved = True
        resolved_event.resolved_at = datetime.now(timezone.utc)
        await db.commit()

        unresolved = await system_event_repo.list_unresolved(db, test_org.id)
        assert len(unresolved) == 2

        unresolved_errors = await system_event_repo.list_unresolved(db, test_org.id, severity="error")
        assert len(unresolved_errors) == 1

    @pytest.mark.asyncio
    async def test_resolve_event(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        event = await system_event_repo.record(db, test_org.id, "extraction_failed", "error", "fail")
        await db.commit()

        result = await system_event_repo.resolve(db, event.id)
        await db.commit()
        assert result is True

        await db.refresh(event)
        assert event.resolved is True
        assert event.resolved_at is not None

    @pytest.mark.asyncio
    async def test_resolve_nonexistent_event(self, db: AsyncSession) -> None:
        result = await system_event_repo.resolve(db, uuid.uuid4())
        assert result is False

    @pytest.mark.asyncio
    async def test_resolve_by_type(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await system_event_repo.record(db, test_org.id, "rate_limited", "warning", "limit 1")
        await system_event_repo.record(db, test_org.id, "rate_limited", "warning", "limit 2")
        await system_event_repo.record(db, test_org.id, "extraction_failed", "error", "other type")
        await db.commit()

        count = await system_event_repo.resolve_by_type(db, test_org.id, "rate_limited")
        await db.commit()
        assert count == 2

        unresolved = await system_event_repo.list_unresolved(db, test_org.id)
        assert len(unresolved) == 1
        assert unresolved[0].event_type == "extraction_failed"

    @pytest.mark.asyncio
    async def test_count_by_type(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        now = datetime.now(timezone.utc)
        await system_event_repo.record(db, test_org.id, "extraction_failed", "error", "fail 1")
        await system_event_repo.record(db, test_org.id, "extraction_failed", "error", "fail 2")
        await system_event_repo.record(db, test_org.id, "rate_limited", "warning", "limit")
        await db.commit()

        count = await system_event_repo.count_by_type(
            db, test_org.id, "extraction_failed", now - timedelta(minutes=1),
        )
        assert count == 2

    @pytest.mark.asyncio
    async def test_get_health_summary(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        now = datetime.now(timezone.utc)
        await system_event_repo.record(db, test_org.id, "extraction_failed", "error", "fail 1")
        await system_event_repo.record(db, test_org.id, "extraction_failed", "error", "fail 2")
        await system_event_repo.record(db, test_org.id, "rate_limited", "warning", "limit")
        await db.commit()

        summary = await system_event_repo.get_health_summary(
            db, test_org.id, now - timedelta(minutes=1),
        )
        assert len(summary) == 2
        type_counts = {s["event_type"]: s["count"] for s in summary}
        assert type_counts["extraction_failed"] == 2
        assert type_counts["rate_limited"] == 1

    @pytest.mark.asyncio
    async def test_list_recent(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        for i in range(15):
            await system_event_repo.record(db, test_org.id, "extraction_failed", "error", f"fail {i}")
        await db.commit()

        recent = await system_event_repo.list_recent(db, test_org.id, limit=10)
        assert len(recent) == 10

    @pytest.mark.asyncio
    async def test_list_filtered(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await system_event_repo.record(db, test_org.id, "extraction_failed", "error", "fail")
        await system_event_repo.record(db, test_org.id, "rate_limited", "warning", "limit")
        await system_event_repo.record(db, test_org.id, "category_corrected", "info", "corrected")
        await db.commit()

        all_events = await system_event_repo.list_filtered(db, test_org.id)
        assert len(all_events) == 3

        errors = await system_event_repo.list_filtered(db, test_org.id, severity="error")
        assert len(errors) == 1
        assert errors[0].event_type == "extraction_failed"

        by_type = await system_event_repo.list_filtered(db, test_org.id, event_type="rate_limited")
        assert len(by_type) == 1


_ANTHROPIC_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _anthropic_status_error(
    cls: type[anthropic.APIStatusError], status: int, error_type: str,
) -> anthropic.APIStatusError:
    response = httpx2.Response(status, request=_ANTHROPIC_REQUEST, headers={"retry-after": "0"})
    body = {"type": "error", "error": {"type": error_type, "message": "provider detail"}}
    return cls("provider detail", response=response, body=body)


async def _error_from_extraction(sdk_error: Exception) -> Exception:
    """What the worker actually catches when Claude fails mid-extraction.

    Runs the real ``extract_from_text`` (shared service, throttle, backoff)
    with only the SDK client faked to raise ``sdk_error``.
    """
    from app.services.extraction import claude_service

    client = MagicMock()
    client.messages.create = AsyncMock(side_effect=sdk_error)
    # Queue reads use a per-call copy with SDK retries off; it is the same fake.
    client.with_options.return_value = client
    with patch.object(claude_service._extraction, "_client", client), \
            patch("asyncio.sleep", new=AsyncMock()):
        try:
            await claude_service.extract_from_text("Invoice from Acme")
        except Exception as exc:  # noqa: BLE001 — the test inspects whatever was raised
            return exc
    raise AssertionError("extraction did not fail")


class TestRetryLogic:
    @pytest.fixture(autouse=True)
    def _reset_throttle(self):
        from app.services.extraction.claude_service import _throttle

        _throttle.consecutive_429s = 0
        _throttle.resume_at = 0.0
        yield
        _throttle.consecutive_429s = 0
        _throttle.resume_at = 0.0

    @pytest.mark.parametrize(
        "sdk_error",
        [
            _anthropic_status_error(anthropic.RateLimitError, 429, "rate_limit_error"),
            _anthropic_status_error(anthropic.InternalServerError, 529, "overloaded_error"),
            _anthropic_status_error(anthropic.InternalServerError, 500, "api_error"),
            _anthropic_status_error(anthropic.APIStatusError, 408, "timeout_error"),
            anthropic.APITimeoutError(request=_ANTHROPIC_REQUEST),
            anthropic.APIConnectionError(request=_ANTHROPIC_REQUEST),
        ],
        ids=["rate_limit", "overloaded", "server_error", "http_408", "timeout", "connection"],
    )
    @pytest.mark.asyncio
    async def test_claude_failures_that_clear_on_their_own_are_retried(self, sdk_error) -> None:

        assert _is_transient(await _error_from_extraction(sdk_error)) is True

    @pytest.mark.parametrize(
        "sdk_error",
        [
            _anthropic_status_error(anthropic.BadRequestError, 400, "invalid_request_error"),
            _anthropic_status_error(anthropic.AuthenticationError, 401, "authentication_error"),
            _anthropic_status_error(anthropic.NotFoundError, 404, "not_found_error"),
        ],
        ids=["invalid_request", "auth", "not_found"],
    )
    @pytest.mark.asyncio
    async def test_claude_failures_a_retry_cannot_fix_are_final(self, sdk_error) -> None:

        assert _is_transient(await _error_from_extraction(sdk_error)) is False

    def test_is_transient_error_timeout(self) -> None:

        assert _is_transient(asyncio.TimeoutError()) is True

    def test_is_transient_error_value_error_not_transient(self) -> None:

        assert _is_transient(ValueError("bad")) is False

    def test_unreadable_replies_are_retried(self) -> None:
        # The shared classification calls this final; MyBookkeeper retries
        # it (bounded) instead of saving a placeholder or losing the item.
        assert _is_transient(ExtractionParseError("not json")) is True

    def test_a_cut_off_reply_is_final(self) -> None:
        # The same input is cut off the same way, so a retry only spends tokens.
        assert _is_transient(ExtractionTruncatedError("cut off")) is False

    def test_retry_delay_doubles_from_one_minute(self) -> None:
        # One delay rule for both Claude queues (claude_retry_policy).
        from app.services.extraction.claude_retry_policy import next_attempt_at

        now = datetime.now(timezone.utc)
        exc = asyncio.TimeoutError()
        assert (next_attempt_at(1, exc, now) - now).total_seconds() == 60
        assert (next_attempt_at(2, exc, now) - now).total_seconds() == 120


def _classify(exc: Exception) -> tuple[str, str]:
    from app.services.extraction.claude_retry_policy import classify_extraction_failure
    from app.workers.upload_processor_worker import _classify_extraction_error

    return _classify_extraction_error(exc, classify_extraction_failure(exc))


class TestErrorClassification:
    def test_generic_error_keeps_friendly_message_and_real_type(self) -> None:
        user_msg, diagnostic = _classify(RuntimeError("boom from claude"))
        assert user_msg == "An unexpected error occurred during extraction. Try re-extracting this document."
        # The diagnostic preserves the real exception type + message for admins.
        assert diagnostic.startswith("RuntimeError: ")
        assert "boom from claude" in diagnostic

    def test_timeout_error_message(self) -> None:
        user_msg, diagnostic = _classify(asyncio.TimeoutError())
        assert "timed out" in user_msg
        assert diagnostic.startswith("TimeoutError")

    def test_db_save_error_message(self) -> None:
        import sqlalchemy.exc
        exc = sqlalchemy.exc.IntegrityError("INSERT ...", {}, Exception("unique violation"))
        user_msg, diagnostic = _classify(exc)
        assert "saving the extraction results" in user_msg
        assert diagnostic.startswith("IntegrityError")

    @pytest.mark.asyncio
    async def test_auth_error_message(self) -> None:
        exc = await _error_from_extraction(
            _anthropic_status_error(anthropic.AuthenticationError, 401, "authentication_error"),
        )
        user_msg, diagnostic = _classify(exc)
        assert "contact support" in user_msg
        assert diagnostic.startswith("ExtractionError")
        assert "authentication_error" in diagnostic

    @pytest.mark.asyncio
    async def test_busy_claude_says_try_again_later(self) -> None:
        exc = await _error_from_extraction(anthropic.APITimeoutError(request=_ANTHROPIC_REQUEST))
        user_msg, _ = _classify(exc)
        assert user_msg == (
            "The AI service is busy right now. Try re-extracting this document in a few minutes."
        )

    @pytest.mark.asyncio
    async def test_rejected_document_message_hides_provider_text(self) -> None:
        exc = await _error_from_extraction(
            _anthropic_status_error(anthropic.BadRequestError, 400, "invalid_request_error"),
        )
        user_msg, _ = _classify(exc)
        assert "couldn't read this document" in user_msg
        assert "provider detail" not in user_msg

    def test_unreadable_and_cut_off_replies_have_their_own_message(self) -> None:
        from app.core.upload_processor_constants import UPLOAD_FAILURE_MESSAGES
        from app.models.extraction.extraction_failure_kind import ExtractionFailureKind

        assert _classify(ExtractionTruncatedError("cut off"))[0] == UPLOAD_FAILURE_MESSAGES[ExtractionFailureKind.CUT_OFF]
        assert _classify(ExtractionParseError("not json"))[0] == UPLOAD_FAILURE_MESSAGES[ExtractionFailureKind.UNREADABLE]


class TestThrottleState:
    def test_throttle_initial_state(self) -> None:
        from app.services.extraction.claude_service import _ThrottleState

        state = _ThrottleState()
        assert state.consecutive_429s == 0
        assert state.resume_at == 0.0

    def test_throttle_state_tracks_consecutive(self) -> None:
        from app.services.extraction.claude_service import _ThrottleState

        state = _ThrottleState()
        state.consecutive_429s += 1
        state.resume_at = time.monotonic() + 60
        assert state.consecutive_429s == 1
        assert state.resume_at > 0

        state.consecutive_429s += 1
        assert state.consecutive_429s == 2

        state.consecutive_429s = 0
        assert state.consecutive_429s == 0


class TestEventService:
    @pytest.mark.asyncio
    async def test_record_event_fire_and_forget(self) -> None:
        """Event recording should never raise even if DB fails."""
        with patch("app.services.system.event_service.unit_of_work") as mock_uow:
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(side_effect=Exception("DB down"))
            mock_session.__aexit__ = AsyncMock()
            mock_uow.return_value = mock_session

            from app.services.system.event_service import record_event
            await record_event(
                uuid.uuid4(), "extraction_failed", "error", "test", None,
            )

    @pytest.mark.asyncio
    async def test_record_event_stores_data(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await system_event_repo.record(
            db, test_org.id, "rate_limited", "warning",
            "Rate limited", {"wait_seconds": 60},
        )
        await db.commit()

        events = await system_event_repo.list_recent(db, test_org.id, limit=1)
        assert len(events) == 1
        assert events[0].event_data == {"wait_seconds": 60}


class TestHealthSummaryAggregation:
    @pytest.mark.asyncio
    async def test_healthy_when_no_problems(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        from app.services.system.health_service import _derive_status

        assert _derive_status([]) == "healthy"

    @pytest.mark.asyncio
    async def test_degraded_on_warning(self) -> None:
        from app.schemas.system.health import ActiveProblem
        from app.services.system.health_service import _derive_status

        problems = [ActiveProblem(type="rate_limited", count=5, severity="warning", message="limited")]
        assert _derive_status(problems) == "degraded"

    @pytest.mark.asyncio
    async def test_degraded_on_error(self) -> None:
        from app.schemas.system.health import ActiveProblem
        from app.services.system.health_service import _derive_status

        problems = [ActiveProblem(type="extraction_failed", count=3, severity="error", message="failed")]
        assert _derive_status(problems) == "degraded"

    @pytest.mark.asyncio
    async def test_unhealthy_on_critical(self) -> None:
        from app.schemas.system.health import ActiveProblem
        from app.services.system.health_service import _derive_status

        problems = [ActiveProblem(type="db_connection_error", count=1, severity="critical", message="db down")]
        assert _derive_status(problems) == "unhealthy"

    @pytest.mark.asyncio
    async def test_unhealthy_overrides_degraded(self) -> None:
        from app.schemas.system.health import ActiveProblem
        from app.services.system.health_service import _derive_status

        problems = [
            ActiveProblem(type="rate_limited", count=5, severity="warning", message="limited"),
            ActiveProblem(type="db_connection_error", count=1, severity="critical", message="db down"),
        ]
        assert _derive_status(problems) == "unhealthy"


class TestRetryFailedDocuments:
    @pytest.mark.asyncio
    async def test_resets_failed_docs_with_low_retry_count(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        doc = Document(
            organization_id=test_org.id,
            user_id=test_user.id,
            file_name="test.pdf",
            file_type="pdf",
            status="failed",
            retry_count=1,
            error_message="Timeout",
        )
        db.add(doc)
        await db.commit()

        from sqlalchemy import func, select
        count_before = await db.execute(
            select(func.count()).select_from(Document).where(
                Document.organization_id == test_org.id,
                Document.status == "failed",
                Document.retry_count < 3,
            )
        )
        assert count_before.scalar_one() == 1

        result = await db.execute(
            select(Document).where(
                Document.organization_id == test_org.id,
                Document.status == "failed",
                Document.retry_count < 3,
            )
        )
        docs = result.scalars().all()
        for d in docs:
            d.status = "processing"
            d.next_retry_at = None
            d.error_message = None
        await db.commit()

        await db.refresh(doc)
        assert doc.status == "processing"
        assert doc.error_message is None

    @pytest.mark.asyncio
    async def test_does_not_reset_exhausted_retries(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        doc = Document(
            organization_id=test_org.id,
            user_id=test_user.id,
            file_name="test.pdf",
            file_type="pdf",
            status="failed",
            retry_count=3,
            error_message="Max retries reached",
        )
        db.add(doc)
        await db.commit()

        from sqlalchemy import select
        result = await db.execute(
            select(Document).where(
                Document.organization_id == test_org.id,
                Document.status == "failed",
                Document.retry_count < 3,
            )
        )
        docs = result.scalars().all()
        assert len(docs) == 0

        await db.refresh(doc)
        assert doc.status == "failed"


class TestRateLimitPause:
    async def test_the_upload_worker_claims_nothing_while_rate_limited(self) -> None:
        # A read now would be rate limited too and charged one of its retries.
        from app.workers import upload_processor_worker as worker

        claim = AsyncMock()
        with (
            patch.object(worker, "rate_limit_pause_seconds", return_value=30.0),
            patch.object(worker.document_repo, "claim_next_processing", claim),
        ):
            assert await worker.process_one_for_user(uuid.uuid4()) is False

        claim.assert_not_awaited()
