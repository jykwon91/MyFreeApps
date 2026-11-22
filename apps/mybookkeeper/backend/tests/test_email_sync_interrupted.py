"""A Gmail sync cancelled mid-read (the scheduler stopping for a deploy) loses nothing.

Before, the email being read stayed ``extracting`` with its attempt charged
and the sync log stayed ``running``. The next discovery then skipped as
``sync_already_running``, the email waited about a day for its claim to go
stale, and the old log was later marked failed "Timed out". Now the drain
hands the email back (``fetched``, due now, attempt not charged) and the
worker closes the log as interrupted, both under ``asyncio.shield``, before
the cancel goes on; the next sync reads the email.
"""
import asyncio
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email.email_queue import EmailQueue
from app.models.email.email_types import DiscoverResult
from app.models.integrations.gmail_sync_target import GmailSyncTarget
from app.models.integrations.sync_log import SyncLog
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import sync_log_repo
from app.services.email import email_extraction_service as svc
from app.services.email.constants import EMAIL_SYNC_INTERRUPTED_ERROR
from app.workers import email_sync_worker


@pytest.fixture()
def bound_db(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _session() -> AsyncIterator[AsyncSession]:
        yield db
        await db.commit()

    with (
        patch.object(svc, "unit_of_work", _session),
        patch.object(svc, "AsyncSessionLocal", _session),
        patch.object(email_sync_worker, "AsyncSessionLocal", _session),
        patch.object(email_sync_worker.organization_repo, "get_member", AsyncMock(return_value=MagicMock())),
        patch.object(email_sync_worker, "drain_gmail_fetch", AsyncMock()),
        patch.object(svc, "EMAIL_EXTRACTION_WAIT_CHECK_SECONDS", 0.01),
    ):
        yield


async def _running_log(db: AsyncSession, user: User, org: Organization) -> SyncLog:
    log = SyncLog(
        organization_id=org.id, user_id=user.id, provider="gmail",
        status="running", started_at=datetime.now(timezone.utc),
    )
    db.add(log)
    await db.commit()
    return log


async def _fetched_item(db: AsyncSession, log: SyncLog, *, attempts: int) -> EmailQueue:
    item = EmailQueue(
        id=uuid.uuid4(), organization_id=log.organization_id, user_id=log.user_id,
        message_id=f"msg_{uuid.uuid4().hex[:8]}", attachment_id="att_1",
        attachment_filename="invoice.pdf", attachment_content_type="application/pdf",
        email_subject="Your invoice", sync_log_id=log.id, raw_content=b"PDF bytes",
        status="fetched", attempts=attempts,
    )
    db.add(item)
    await db.commit()
    return item


@pytest.mark.usefixtures("bound_db")
async def test_a_sync_cancelled_mid_read_hands_the_email_back_and_the_next_sync_reads_it(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    target = GmailSyncTarget(organization_id=test_org.id, user_id=test_user.id)
    first_log = await _running_log(db, test_user, test_org)
    item = await _fetched_item(db, first_log, attempts=1)
    reading = asyncio.Event()

    async def _read_until_cancelled(*_a: object, **_k: object) -> None:
        reading.set()
        await asyncio.Event().wait()

    discover_first = AsyncMock(return_value=DiscoverResult("queued", sync_log_id=first_log.id))
    with (
        patch.object(email_sync_worker, "discover_gmail_emails", discover_first),
        patch.object(svc, "_extract_from_attachment", _read_until_cancelled),
    ):
        sync = asyncio.create_task(email_sync_worker.sync_gmail_connection(target))
        await asyncio.wait_for(reading.wait(), timeout=5)
        await db.refresh(item)
        assert (item.status, item.attempts) == ("extracting", 2)

        sync.cancel()
        with pytest.raises(asyncio.CancelledError):
            await sync

    await db.refresh(item)
    assert item.status == "fetched"
    assert item.attempts == 1
    assert item.next_attempt_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc)
    await db.refresh(first_log)
    assert first_log.status == "cancelled"
    assert first_log.error == EMAIL_SYNC_INTERRUPTED_ERROR
    assert first_log.completed_at is not None

    # The next discovery isn't skipped as "sync_already_running"...
    assert await sync_log_repo.count_running(db, test_org.id, "gmail") == 0
    second_log = await _running_log(db, test_user, test_org)

    # ...and its drain reads the email.
    with (
        patch.object(email_sync_worker, "discover_gmail_emails",
                     AsyncMock(return_value=DiscoverResult("queued", sync_log_id=second_log.id))),
        patch.object(svc, "_extract_from_attachment", AsyncMock(return_value={"data": [], "tokens": 10})),
    ):
        await email_sync_worker.sync_gmail_connection(target)

    await db.refresh(item)
    assert item.status == "done"
    assert item.attempts == 2
    await db.refresh(second_log)
    assert second_log.status == "success"


@pytest.mark.usefixtures("bound_db")
async def test_closing_an_interrupted_sync_leaves_one_that_already_ended_alone(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    log = await _running_log(db, test_user, test_org)
    log.status = "success"
    await db.commit()

    await svc.close_interrupted_sync_log(log.id)

    await db.refresh(log)
    assert log.status == "success"
    assert log.error is None
