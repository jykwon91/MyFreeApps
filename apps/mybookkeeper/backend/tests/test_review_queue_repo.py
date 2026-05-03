"""Tests for the review queue repository.

Covers:
- insert_if_not_exists — idempotency (same message_id → no second row)
- list_pending — filters correctly by org and status
- get_by_id_scoped — IDOR safety (wrong org returns None)
- count_pending — accurate count
- mark_resolved / mark_ignored / soft_delete — status transitions
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar.calendar_email_review_queue import CalendarEmailReviewQueue
from app.repositories.calendar import review_queue_repo


async def _insert(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    message_id: str = "msg-1",
    channel: str = "airbnb",
    payload: dict | None = None,
) -> CalendarEmailReviewQueue | None:
    return await review_queue_repo.insert_if_not_exists(
        db,
        user_id=user_id,
        organization_id=org_id,
        email_message_id=message_id,
        source_channel=channel,
        parsed_payload=payload or {},
    )


class TestInsertIfNotExists:
    @pytest.mark.asyncio
    async def test_inserts_new_item(self, db: AsyncSession, test_user, test_org) -> None:
        item = await _insert(db, user_id=test_user.id, org_id=test_org.id)
        assert item is not None
        assert item.status == "pending"
        assert item.source_channel == "airbnb"

    @pytest.mark.asyncio
    async def test_idempotent_same_user_same_message(self, db: AsyncSession, test_user, test_org) -> None:
        """Inserting the same (user_id, email_message_id) twice is a no-op."""
        first = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="dup-msg",
        )
        assert first is not None

        second = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="dup-msg",
        )
        # ON CONFLICT DO NOTHING → returns None
        assert second is None

    @pytest.mark.asyncio
    async def test_different_users_same_message_both_inserted(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        """Two users can have queue entries for the same Gmail message_id."""
        other_user = __import__("uuid").uuid4()
        other_org = __import__("uuid").uuid4()

        first = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="shared-msg",
        )
        second = await _insert(
            db, user_id=other_user, org_id=other_org, message_id="shared-msg",
        )
        assert first is not None
        assert second is not None
        assert first.id != second.id


class TestListPending:
    @pytest.mark.asyncio
    async def test_returns_pending_items(self, db: AsyncSession, test_user, test_org) -> None:
        await _insert(db, user_id=test_user.id, org_id=test_org.id, message_id="m1")
        await _insert(db, user_id=test_user.id, org_id=test_org.id, message_id="m2")

        items = await review_queue_repo.list_pending(db, organization_id=test_org.id)
        assert len(items) == 2
        assert all(i.status == "pending" for i in items)

    @pytest.mark.asyncio
    async def test_excludes_resolved_and_ignored(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        item = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="m-res",
        )
        assert item is not None
        now = datetime.now(timezone.utc)
        await review_queue_repo.mark_resolved(db, item, resolved_at=now)

        items = await review_queue_repo.list_pending(db, organization_id=test_org.id)
        assert all(i.id != item.id for i in items)

    @pytest.mark.asyncio
    async def test_excludes_soft_deleted(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        item = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="m-del",
        )
        assert item is not None
        now = datetime.now(timezone.utc)
        await review_queue_repo.soft_delete(db, item, deleted_at=now)

        items = await review_queue_repo.list_pending(db, organization_id=test_org.id)
        assert all(i.id != item.id for i in items)

    @pytest.mark.asyncio
    async def test_scoped_to_org(self, db: AsyncSession, test_user, test_org) -> None:
        """Items for a different org are not returned."""
        other_org_id = uuid.uuid4()
        await _insert(
            db, user_id=test_user.id, org_id=other_org_id, message_id="other-org-msg",
        )
        items = await review_queue_repo.list_pending(db, organization_id=test_org.id)
        assert all(i.organization_id == test_org.id for i in items)


class TestGetByIdScoped:
    @pytest.mark.asyncio
    async def test_returns_item_for_correct_org(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        item = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="scoped-1",
        )
        assert item is not None
        found = await review_queue_repo.get_by_id_scoped(db, item.id, test_org.id)
        assert found is not None
        assert found.id == item.id

    @pytest.mark.asyncio
    async def test_returns_none_for_wrong_org(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        """IDOR guard — wrong org_id must return None, not the item."""
        item = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="scoped-2",
        )
        assert item is not None
        found = await review_queue_repo.get_by_id_scoped(db, item.id, uuid.uuid4())
        assert found is None

    @pytest.mark.asyncio
    async def test_returns_none_after_soft_delete(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        item = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="scoped-del",
        )
        assert item is not None
        await review_queue_repo.soft_delete(
            db, item, deleted_at=datetime.now(timezone.utc),
        )
        found = await review_queue_repo.get_by_id_scoped(db, item.id, test_org.id)
        assert found is None


class TestCountPending:
    @pytest.mark.asyncio
    async def test_counts_only_pending(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        item = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="cnt-1",
        )
        assert item is not None
        ignored = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="cnt-2",
        )
        assert ignored is not None
        await review_queue_repo.mark_ignored(
            db, ignored, resolved_at=datetime.now(timezone.utc),
        )

        count = await review_queue_repo.count_pending(
            db, organization_id=test_org.id,
        )
        assert count == 1


class TestStatusTransitions:
    @pytest.mark.asyncio
    async def test_mark_resolved(self, db: AsyncSession, test_user, test_org) -> None:
        item = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="tr-1",
        )
        assert item is not None
        now = datetime.now(timezone.utc)
        await review_queue_repo.mark_resolved(db, item, resolved_at=now)
        assert item.status == "resolved"
        assert item.resolved_at is not None

    @pytest.mark.asyncio
    async def test_mark_ignored(self, db: AsyncSession, test_user, test_org) -> None:
        item = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="tr-2",
        )
        assert item is not None
        now = datetime.now(timezone.utc)
        await review_queue_repo.mark_ignored(db, item, resolved_at=now)
        assert item.status == "ignored"
        assert item.resolved_at is not None

    @pytest.mark.asyncio
    async def test_soft_delete(self, db: AsyncSession, test_user, test_org) -> None:
        item = await _insert(
            db, user_id=test_user.id, org_id=test_org.id, message_id="tr-3",
        )
        assert item is not None
        now = datetime.now(timezone.utc)
        await review_queue_repo.soft_delete(db, item, deleted_at=now)
        assert item.deleted_at is not None
        # Status not changed by soft_delete — item remains "pending" but hidden.
        assert item.status == "pending"
