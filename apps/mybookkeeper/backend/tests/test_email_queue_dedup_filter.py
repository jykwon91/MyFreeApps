"""email_queue_repo.get_message_ids — status-aware dedup filter.

Regression coverage for the silent-skip lockout. Before the fix, ANY queue
row would lock its message_id out of re-fetch forever — even rows whose
extraction silently produced zero Documents (e.g. payment-confirmation
duplicates that were misclassified). After the fix, only rows that are
in-flight (``fetched``, ``extracting``) or successfully produced a Document
(``done``) lock the message_id. ``skipped`` and ``failed`` rows are
re-fetchable.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email.email_queue import EmailQueue
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.email import email_queue_repo


async def _insert_queue_row(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    message_id: str,
    status: str,
) -> None:
    row = EmailQueue(
        organization_id=org_id,
        user_id=user_id,
        message_id=message_id,
        attachment_id="body",
        status=status,
        sync_log_id=1,
        created_at=datetime.now(timezone.utc),
    )
    # Need a sync_logs row for the FK
    from app.models.integrations.sync_log import SyncLog
    from sqlalchemy import select
    existing = await db.execute(select(SyncLog).where(SyncLog.id == 1))
    if existing.scalar_one_or_none() is None:
        db.add(SyncLog(
            id=1,
            organization_id=org_id,
            user_id=user_id,
            provider="gmail",
            status="success",
        ))
        await db.flush()
    db.add(row)
    await db.flush()


class TestGetMessageIdsStatusFilter:
    @pytest.mark.asyncio
    async def test_done_rows_are_locked_out(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _insert_queue_row(
            db, org_id=test_org.id, user_id=test_user.id,
            message_id="msg-done", status="done",
        )
        ids = await email_queue_repo.get_message_ids(db, test_org.id)
        assert "msg-done" in ids

    @pytest.mark.asyncio
    async def test_in_flight_rows_are_locked_out(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _insert_queue_row(
            db, org_id=test_org.id, user_id=test_user.id,
            message_id="msg-fetched", status="fetched",
        )
        await _insert_queue_row(
            db, org_id=test_org.id, user_id=test_user.id,
            message_id="msg-extracting", status="extracting",
        )
        ids = await email_queue_repo.get_message_ids(db, test_org.id)
        assert "msg-fetched" in ids
        assert "msg-extracting" in ids

    @pytest.mark.asyncio
    async def test_skipped_rows_are_refetchable(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        # The whole point of the fix: skipped rows must NOT lock the
        # message_id, so a future sync with a better prompt can re-fetch.
        await _insert_queue_row(
            db, org_id=test_org.id, user_id=test_user.id,
            message_id="msg-skipped", status="skipped",
        )
        ids = await email_queue_repo.get_message_ids(db, test_org.id)
        assert "msg-skipped" not in ids

    @pytest.mark.asyncio
    async def test_failed_rows_are_refetchable(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _insert_queue_row(
            db, org_id=test_org.id, user_id=test_user.id,
            message_id="msg-failed", status="failed",
        )
        ids = await email_queue_repo.get_message_ids(db, test_org.id)
        assert "msg-failed" not in ids

    @pytest.mark.asyncio
    async def test_org_isolation(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        # Pin org-scoping: a row in test_org must not be returned when
        # we query a *different* org (synthesised via uuid4).
        await _insert_queue_row(
            db, org_id=test_org.id, user_id=test_user.id,
            message_id="my-org-msg", status="done",
        )
        other_org_id = uuid.uuid4()
        ids = await email_queue_repo.get_message_ids(db, other_org_id)
        assert "my-org-msg" not in ids


class TestMarkSkipped:
    @pytest.mark.asyncio
    async def test_mark_skipped_sets_status_and_clears_content(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _insert_queue_row(
            db, org_id=test_org.id, user_id=test_user.id,
            message_id="msg-x", status="extracting",
        )
        from sqlalchemy import select
        result = await db.execute(
            select(EmailQueue).where(EmailQueue.message_id == "msg-x")
        )
        item = result.scalar_one()
        await email_queue_repo.mark_skipped(db, item, reason="payment confirmation")
        await db.flush()
        assert item.status == "skipped"
        assert item.error == "payment confirmation"

    @pytest.mark.asyncio
    async def test_mark_skipped_truncates_long_reasons(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _insert_queue_row(
            db, org_id=test_org.id, user_id=test_user.id,
            message_id="msg-long", status="extracting",
        )
        from sqlalchemy import select
        result = await db.execute(
            select(EmailQueue).where(EmailQueue.message_id == "msg-long")
        )
        item = result.scalar_one()
        long_reason = "x" * 2000
        await email_queue_repo.mark_skipped(db, item, reason=long_reason)
        await db.flush()
        await db.refresh(item)
        assert item.status == "skipped"
        assert item.error is not None
        assert len(item.error) == 1000
