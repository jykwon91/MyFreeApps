"""A fetched email whose Claude read fails for a passing reason stays in the queue.

Regression for two ways an invoice email used to be lost for good:

- A rate limit or slow read hit the per-item time limit and the row was
  marked ``failed`` "Extraction timed out". Re-discovery's insert then hit
  the unique key and did nothing, so the email was never read again.
- A cut-off or unparseable reply became a low-confidence "uncategorized"
  placeholder, which persistence skipped and the queue marked ``done``.

Now both put the row back to ``fetched`` with a retry time, the drain waits
for it within the same sync, and after EMAIL_EXTRACTION_MAX_ATTEMPTS the row
is ``failed`` with a plain reason the user can retry from.

Also covered: a claim records when it was taken, so a read that is still
going is never read a second time, a claim left by a dead drain is taken
back (and counted), and a dismissal or reclaim made during a read is never
undone by that read's result. The drain's waits check for cancel, and it
waits out an Anthropic rate limit instead of spending attempts on it.
"""
import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import anthropic
import httpx
import pytest
from platform_shared.extraction import (
    ExtractionError,
    ExtractionParseError,
    ExtractionTruncatedError,
    RateLimitPausedError,
    extraction_error_from_anthropic,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.document_constants import (
    CLAUDE_RETRY_BASE_DELAY_SECONDS,
    CLAUDE_RETRY_MAX_DELAY_SECONDS,
    EXTRACTION_CLAIM_LIFETIME_SECONDS,
)
from app.models.documents.document import Document
from app.models.email.email_queue import EmailQueue
from app.models.extraction.extraction_failure_kind import ExtractionFailureKind
from app.models.integrations.sync_log import SyncLog
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories import email_queue_repo, sync_log_repo
from app.services.email import email_extraction_service as svc
from app.services.email.constants import (
    EMAIL_EXTRACTION_FAILURE_MESSAGES,
    EMAIL_EXTRACTION_INTERRUPTED_ERROR,
    EMAIL_EXTRACTION_MAX_ATTEMPTS,
)
from app.services.email.email_extraction_retry import failure_reason
from app.services.extraction.claude_retry_policy import (
    classify_extraction_failure,
    retry_delay_seconds,
)
from app.services.integrations import integration_service

_REQUEST = httpx.Request("POST", "https://api.anthropic.com/v1/messages")


def _from_sdk(exc: anthropic.APIError) -> ExtractionError:
    """What the shared ExtractionService raises for an SDK failure (``raise ... from exc``)."""
    error = extraction_error_from_anthropic(exc, log_prefix="test")
    error.__cause__ = exc
    return error


def _rate_limited(retry_after: str | None = None) -> ExtractionError:
    headers = {"retry-after": retry_after} if retry_after is not None else {}
    return _from_sdk(anthropic.RateLimitError(
        "rate limited", response=httpx.Response(429, headers=headers, request=_REQUEST), body=None,
    ))


def _status_error(status: int, headers: dict[str, str] | None = None) -> ExtractionError:
    # The SDK raises the status's own subclass (AuthenticationError for 401...).
    error_class = {
        401: anthropic.AuthenticationError,
        403: anthropic.PermissionDeniedError,
    }.get(status, anthropic.APIStatusError)
    response = httpx.Response(status, headers=headers or {}, request=_REQUEST)
    return _from_sdk(error_class("error", response=response, body=None))


@pytest.fixture()
async def ctx_and_log(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> tuple[RequestContext, SyncLog]:
    log = SyncLog(
        organization_id=test_org.id, user_id=test_user.id, provider="gmail",
        status="running", started_at=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.flush()
    ctx = RequestContext(organization_id=test_org.id, user_id=test_user.id, org_role=OrgRole.OWNER)
    return ctx, log


@pytest.fixture()
def bound_db(db: AsyncSession) -> AsyncIterator[None]:
    @asynccontextmanager
    async def _session() -> AsyncIterator[AsyncSession]:
        yield db
        await db.commit()

    with (
        patch.object(svc, "unit_of_work", _session),
        patch.object(svc, "AsyncSessionLocal", _session),
        patch.object(integration_service, "unit_of_work", _session),
        patch.object(integration_service, "AsyncSessionLocal", _session),
        patch.object(svc, "EMAIL_EXTRACTION_WAIT_CHECK_SECONDS", 0.01),
    ):
        yield


async def _fetched_item(
    db: AsyncSession, ctx: RequestContext, log: SyncLog, *, attempts: int = 0,
    next_attempt_at: datetime | None = None, status: str = "fetched",
    claimed_at: datetime | None = None,
) -> EmailQueue:
    item = EmailQueue(
        id=uuid.uuid4(),
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
        message_id=f"msg_{uuid.uuid4().hex[:8]}",
        attachment_id="att_1",
        attachment_filename="invoice.pdf",
        attachment_content_type="application/pdf",
        email_subject="Your invoice",
        sync_log_id=log.id,
        raw_content=b"PDF bytes",
        status=status,
        attempts=attempts,
        next_attempt_at=next_attempt_at,
        claimed_at=claimed_at,
    )
    db.add(item)
    await db.commit()
    return item


async def _documents(db: AsyncSession, ctx: RequestContext) -> list[Document]:
    result = await db.execute(select(Document).where(Document.organization_id == ctx.organization_id))
    return list(result.scalars().all())


def _message(kind: ExtractionFailureKind) -> str:
    return EMAIL_EXTRACTION_FAILURE_MESSAGES[kind]


@pytest.mark.usefixtures("bound_db")
class TestFailedReadStaysQueued:
    @pytest.mark.parametrize(
        ("error", "reason"),
        [
            (_rate_limited(), _message(ExtractionFailureKind.BUSY)),
            (_status_error(529), _message(ExtractionFailureKind.BUSY)),
            (_from_sdk(anthropic.APIConnectionError(request=_REQUEST)), _message(ExtractionFailureKind.BUSY)),
            (ExtractionParseError("not json"), _message(ExtractionFailureKind.UNREADABLE)),
        ],
    )
    async def test_passing_failure_is_retried_later_not_failed_or_done(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
        error: Exception, reason: str,
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)
        before = datetime.now(timezone.utc)

        with patch.object(svc, "_extract_from_attachment", AsyncMock(side_effect=error)):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "retry_scheduled"
        await db.refresh(item)
        assert item.status == "fetched"
        assert item.attempts == 1
        assert item.error is not None and item.error.startswith(reason)
        retry_at = item.next_attempt_at.replace(tzinfo=timezone.utc)
        assert retry_at >= before + timedelta(seconds=CLAUDE_RETRY_BASE_DELAY_SECONDS - 1)
        # Nothing was saved from the failed read.
        assert await _documents(db, ctx) == []
        row = await db.execute(select(EmailQueue.raw_content).where(EmailQueue.id == item.id))
        assert row.scalar_one() == b"PDF bytes"

    async def test_a_cut_off_reply_fails_at_once_without_inviting_a_retry(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        # The same email is cut off the same way every time.
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)

        with patch.object(svc, "_extract_from_attachment", AsyncMock(side_effect=ExtractionTruncatedError("cut off"))):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "failed"
        await db.refresh(item)
        assert item.status == "failed"
        assert item.attempts == 1
        assert item.error == _message(ExtractionFailureKind.CUT_OFF)
        assert "won't help" in item.error

    async def test_a_read_held_back_by_the_rate_limit_is_requeued_uncharged_for_when_it_lifts(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log, attempts=1)
        before = datetime.now(timezone.utc)

        with patch.object(svc, "_extract_from_attachment", AsyncMock(side_effect=RateLimitPausedError(600))):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "retry_scheduled"
        await db.refresh(item)
        assert item.status == "fetched"
        assert item.attempts == 1
        assert item.error is None
        resume = item.next_attempt_at.replace(tzinfo=timezone.utc)
        assert before + timedelta(seconds=599) <= resume <= datetime.now(timezone.utc) + timedelta(seconds=600)

    async def test_a_slow_read_times_out_and_is_retried(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)

        async def _slow(*_a: object, **_k: object) -> None:
            await asyncio.sleep(5)

        with (
            patch.object(svc, "EXTRACTION_TIMEOUT_SECONDS", 0.01),
            patch.object(svc, "_extract_from_attachment", _slow),
        ):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "retry_scheduled"
        await db.refresh(item)
        assert item.status == "fetched"
        assert item.error.startswith(_message(ExtractionFailureKind.TIMED_OUT))

    async def test_last_attempt_fails_with_a_reason_the_user_can_retry(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log, attempts=EMAIL_EXTRACTION_MAX_ATTEMPTS - 1)

        with patch.object(svc, "_extract_from_attachment", AsyncMock(side_effect=_rate_limited())):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "failed"
        await db.refresh(item)
        assert item.status == "failed"
        assert item.attempts == EMAIL_EXTRACTION_MAX_ATTEMPTS
        assert item.next_attempt_at is None
        assert item.error.startswith(_message(ExtractionFailureKind.BUSY))
        assert f"tried {EMAIL_EXTRACTION_MAX_ATTEMPTS} times" in item.error

        # The user's retry gets a full set of attempts again.
        await db.refresh(item, ["raw_content"])
        new_status = await email_queue_repo.retry_item(db, item)
        assert new_status == "fetched"
        assert item.attempts == 0
        assert item.next_attempt_at is None

    @pytest.mark.parametrize(
        ("error", "kind"),
        [
            (_status_error(401), ExtractionFailureKind.MISCONFIGURED),
            (_status_error(413), ExtractionFailureKind.REJECTED),
            (ValueError("zip at /srv/secret/path is corrupt"), ExtractionFailureKind.OTHER),
        ],
    )
    async def test_failure_that_retrying_cannot_fix_fails_at_once_with_a_plain_reason(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
        error: Exception, kind: ExtractionFailureKind,
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)

        with patch.object(svc, "_extract_from_attachment", AsyncMock(side_effect=error)):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "failed"
        await db.refresh(item)
        assert item.status == "failed"
        assert item.attempts == 1
        assert item.error.startswith(_message(kind))
        # The raw exception text is logged, never shown.
        assert str(error) not in item.error

    async def test_a_row_waiting_out_its_delay_is_not_claimed(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        later = datetime.now(timezone.utc) + timedelta(minutes=5)
        await _fetched_item(db, ctx, log, attempts=1, next_attempt_at=later)

        result = await svc._extract_next_fetched(ctx)

        assert result.status == "nothing_to_extract"
        retry_at = await email_queue_repo.next_retry_at(db, ctx.organization_id)
        assert retry_at is not None

    async def test_drain_waits_for_the_retry_and_reads_the_email(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)
        reads = AsyncMock(side_effect=[_rate_limited(), {"data": [], "tokens": 10}])

        def _soon(_attempts: int, _exc: BaseException, now: datetime) -> datetime:
            return now + timedelta(milliseconds=50)

        with (
            patch.object(svc, "_extract_from_attachment", reads),
            patch.object(svc, "next_attempt_at", _soon),
        ):
            await svc.drain_claude_extraction(ctx, sync_log_id=log.id)

        assert reads.await_count == 2
        await db.refresh(item)
        assert item.status == "done"
        assert item.attempts == 2
        # The drain marked the sync as still going while it worked.
        await db.refresh(log)
        assert log.last_progress_at is not None


@pytest.mark.usefixtures("bound_db")
class TestClaims:
    async def test_a_read_that_is_still_going_is_not_read_again(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        await _fetched_item(
            db, ctx, log, status="extracting", attempts=1, claimed_at=datetime.now(timezone.utc),
        )

        result = await svc._extract_next_fetched(ctx)

        assert result.status == "nothing_to_extract"

    @pytest.mark.parametrize("claim_age", [EXTRACTION_CLAIM_LIFETIME_SECONDS + 1, None])
    async def test_a_claim_left_by_a_dead_drain_is_taken_back_and_counted(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog], claim_age: int | None,
    ) -> None:
        # No claim time at all: a row claimed before claimed_at existed.
        ctx, log = ctx_and_log
        claimed_at = None if claim_age is None else datetime.now(timezone.utc) - timedelta(seconds=claim_age)
        item = await _fetched_item(db, ctx, log, status="extracting", attempts=1, claimed_at=claimed_at)

        reads = AsyncMock(return_value={"data": [], "tokens": 10})
        with patch.object(svc, "_extract_from_attachment", reads):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "done"
        assert reads.await_count == 1
        await db.refresh(item)
        assert item.status == "done"
        assert item.attempts == 2

    async def test_an_email_whose_read_keeps_dying_stops_being_claimed(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        stale = datetime.now(timezone.utc) - timedelta(seconds=EXTRACTION_CLAIM_LIFETIME_SECONDS + 1)
        item = await _fetched_item(
            db, ctx, log, status="extracting", attempts=EMAIL_EXTRACTION_MAX_ATTEMPTS, claimed_at=stale,
        )

        reads = AsyncMock()
        with patch.object(svc, "_extract_from_attachment", reads):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "failed"
        reads.assert_not_awaited()
        await db.refresh(item)
        assert item.status == "failed"
        assert item.error.startswith(EMAIL_EXTRACTION_INTERRUPTED_ERROR)

    async def test_dismissing_during_the_read_is_not_undone(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)

        async def _read_then_dismissed(*_a: object, **_k: object) -> dict[str, object]:
            assert await integration_service.dismiss_queue_item(ctx, item.id) is True
            return {"data": [{"vendor": "Acme", "amount": "10.00"}], "tokens": 10}

        with patch.object(svc, "_extract_from_attachment", _read_then_dismissed):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "discarded"
        await db.refresh(item)
        assert item.status == "dismissed"
        assert item.error is None
        assert await _documents(db, ctx) == []

    async def test_a_failed_read_does_not_undo_a_dismissal(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)

        async def _dismissed_then_rate_limited(*_a: object, **_k: object) -> None:
            await integration_service.dismiss_queue_item(ctx, item.id)
            raise _rate_limited()

        with patch.object(svc, "_extract_from_attachment", _dismissed_then_rate_limited):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "discarded"
        await db.refresh(item)
        assert item.status == "dismissed"

    async def test_a_reclaimed_row_keeps_the_new_claim(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)
        other_claim = datetime.now(timezone.utc) + timedelta(seconds=1)

        async def _read_while_reclaimed(*_a: object, **_k: object) -> dict[str, object]:
            row = await db.get(EmailQueue, item.id)
            assert row is not None
            row.claimed_at = other_claim
            await db.commit()
            return {"data": [], "tokens": 10}

        with patch.object(svc, "_extract_from_attachment", _read_while_reclaimed):
            result = await svc._extract_next_fetched(ctx)

        assert result.status == "discarded"
        await db.refresh(item)
        assert item.status == "extracting"

    async def test_dismissing_a_row_that_is_not_being_read_deletes_it(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)
        item_id = item.id

        assert await email_queue_repo.dismiss_if_extracting(db, item_id) is False
        assert await integration_service.dismiss_queue_item(ctx, item_id) is True
        db.expunge_all()
        assert await db.get(EmailQueue, item_id) is None


@pytest.mark.usefixtures("bound_db")
class TestDrainWaits:
    async def test_cancel_interrupts_the_wait_for_a_retry(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        later = datetime.now(timezone.utc) + timedelta(hours=1)
        await _fetched_item(db, ctx, log, attempts=1, next_attempt_at=later)

        cancelled = AsyncMock(side_effect=[False, False, True])
        with patch.object(svc.sync_log_repo, "is_cancelled", cancelled):
            await asyncio.wait_for(svc.drain_claude_extraction(ctx, sync_log_id=log.id), timeout=5)

        assert cancelled.await_count == 3

    async def test_a_rate_limit_pauses_the_drain_without_spending_attempts(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)

        reads = AsyncMock()
        with (
            patch.object(svc, "rate_limit_pause_seconds", return_value=600.0),
            patch.object(svc.sync_log_repo, "is_cancelled", AsyncMock(side_effect=[False, False, True])),
            patch.object(svc, "_extract_from_attachment", reads),
        ):
            await asyncio.wait_for(svc.drain_claude_extraction(ctx, sync_log_id=log.id), timeout=5)

        reads.assert_not_awaited()
        await db.refresh(item)
        assert item.status == "fetched"
        assert item.attempts == 0


class TestSyncTimeout:
    async def test_a_sync_still_making_progress_is_not_timed_out(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        log.started_at = datetime.now(timezone.utc) - timedelta(hours=2)
        await db.flush()
        await sync_log_repo.touch_progress(db, log.id)
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=EXTRACTION_CLAIM_LIFETIME_SECONDS)

        await sync_log_repo.timeout_stuck(db, ctx.organization_id, "gmail", cutoff)

        await db.refresh(log)
        assert log.status == "running"

    async def test_a_sync_that_went_quiet_is_timed_out(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        log.started_at = datetime.now(timezone.utc) - timedelta(hours=2)
        log.last_progress_at = datetime.now(timezone.utc) - timedelta(hours=1)
        await db.flush()
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=EXTRACTION_CLAIM_LIFETIME_SECONDS)

        await sync_log_repo.timeout_stuck(db, ctx.organization_id, "gmail", cutoff)

        await db.refresh(log)
        assert log.status == "failed"


class TestRediscovery:
    async def test_failed_rows_are_not_relisted(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        # Re-listing a failed row did nothing (the insert hits the unique key)
        # while the sync reported it as queued; it waits for the user's retry.
        ctx, log = ctx_and_log
        item = await _fetched_item(db, ctx, log)
        item.status = "failed"
        await db.commit()

        assert item.message_id in await email_queue_repo.get_message_ids(db, ctx.organization_id)


@pytest.mark.usefixtures("bound_db")
class TestDismissedRows:
    async def _dismissed(self, db: AsyncSession, ctx: RequestContext, log: SyncLog) -> EmailQueue:
        item = await _fetched_item(db, ctx, log, status="extracting", attempts=1, claimed_at=datetime.now(timezone.utc))
        assert await integration_service.dismiss_queue_item(ctx, item.id) is True
        await db.refresh(item)
        assert item.status == "dismissed"
        return item

    async def test_a_dismissed_email_is_not_fetched_again(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await self._dismissed(db, ctx, log)

        assert item.message_id in await email_queue_repo.get_message_ids(db, ctx.organization_id)

    async def test_retry_all_leaves_a_dismissed_email_alone(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await self._dismissed(db, ctx, log)

        await integration_service.retry_all_failed(ctx)

        await db.refresh(item)
        assert item.status == "dismissed"

    async def test_a_dismissed_email_leaves_the_queue_list(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        item = await self._dismissed(db, ctx, log)
        kept = await _fetched_item(db, ctx, log)

        listed = {row["id"] for row in await integration_service.get_queue_items(ctx)}

        assert str(item.id) not in listed
        assert str(kept.id) in listed

    async def test_a_dismissed_email_is_not_a_failure_of_the_sync(
        self, db: AsyncSession, ctx_and_log: tuple[RequestContext, SyncLog],
    ) -> None:
        ctx, log = ctx_and_log
        await self._dismissed(db, ctx, log)
        await _fetched_item(db, ctx, log, status="done")

        await svc.finalize_sync_log(log.id, ctx)

        await db.refresh(log)
        assert log.status == "success"
        assert log.error is None
        [info] = [row for row in await integration_service.get_sync_logs(ctx) if row["id"] == log.id]
        assert info["emails_done"] == 2


class TestRetryPolicy:
    def test_delay_doubles_per_attempt(self) -> None:
        exc = ExtractionParseError("x")
        assert retry_delay_seconds(1, exc) == CLAUDE_RETRY_BASE_DELAY_SECONDS
        assert retry_delay_seconds(2, exc) == CLAUDE_RETRY_BASE_DELAY_SECONDS * 2

    def test_honours_a_longer_retry_after(self) -> None:
        assert retry_delay_seconds(1, _rate_limited("90")) == 90

    def test_honours_retry_after_on_an_overload(self) -> None:
        assert retry_delay_seconds(1, _status_error(529, {"retry-after": "100"})) == 100

    def test_capped(self) -> None:
        assert retry_delay_seconds(1, _rate_limited("3600")) == CLAUDE_RETRY_MAX_DELAY_SECONDS
        assert retry_delay_seconds(10, ExtractionParseError("x")) == CLAUDE_RETRY_MAX_DELAY_SECONDS

    def test_reason_never_carries_the_exception_text(self) -> None:
        failure = classify_extraction_failure(ValueError("bad zip"))
        reason = failure_reason(failure, attempts=1, will_retry=False)
        assert "bad zip" not in reason
        assert reason.startswith(_message(ExtractionFailureKind.OTHER))
