"""Tests for self-healing infrastructure: retry logic, throttle state, event recording, health summary."""
import asyncio
import time
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.system.system_event import SystemEvent
from app.models.system.usage_log import UsageLog
from app.models.user.user import User
from app.repositories import system_event_repo


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


class TestRetryLogic:
    def test_is_transient_error_rate_limit(self) -> None:
        import anthropic
        from app.workers.upload_processor_worker import _is_transient_error

        mock_response = MagicMock()
        mock_response.status_code = 429
        exc = anthropic.RateLimitError(
            message="rate limited",
            response=mock_response,
            body=None,
        )
        assert _is_transient_error(exc) is True

    def test_is_transient_error_5xx(self) -> None:
        import anthropic
        from app.workers.upload_processor_worker import _is_transient_error

        mock_response = MagicMock()
        mock_response.status_code = 500
        exc = anthropic.APIStatusError(
            message="server error",
            response=mock_response,
            body=None,
        )
        assert _is_transient_error(exc) is True

    def test_is_transient_error_4xx_not_transient(self) -> None:
        import anthropic
        from app.workers.upload_processor_worker import _is_transient_error

        mock_response = MagicMock()
        mock_response.status_code = 400
        exc = anthropic.APIStatusError(
            message="bad request",
            response=mock_response,
            body=None,
        )
        assert _is_transient_error(exc) is False

    def test_is_transient_error_timeout(self) -> None:
        from app.workers.upload_processor_worker import _is_transient_error

        assert _is_transient_error(asyncio.TimeoutError()) is True

    def test_is_transient_error_value_error_not_transient(self) -> None:
        from app.workers.upload_processor_worker import _is_transient_error

        assert _is_transient_error(ValueError("bad")) is False

    def test_compute_next_retry_exponential(self) -> None:
        from app.workers.upload_processor_worker import _compute_next_retry

        before = datetime.now(timezone.utc)
        retry_1 = _compute_next_retry(1)
        retry_2 = _compute_next_retry(2)

        assert retry_1 > before
        assert retry_2 > retry_1
        delta_1 = (retry_1 - before).total_seconds()
        delta_2 = (retry_2 - before).total_seconds()
        assert 110 < delta_1 < 130
        assert 230 < delta_2 < 260


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
        from app.schemas.system.health import ActiveProblem
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

        from sqlalchemy import select, func
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
