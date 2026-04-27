"""Tests for inquiry_event_repo — append-only timeline."""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry import Inquiry
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import inquiry_event_repo


def _seed_inquiry(*, org_id: uuid.UUID, user_id: uuid.UUID) -> Inquiry:
    return Inquiry(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        source="direct", stage="new",
        received_at=_dt.datetime.now(_dt.timezone.utc),
    )


class TestInquiryEventCreateAndList:
    @pytest.mark.asyncio
    async def test_create_and_list_chronological(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inq = _seed_inquiry(org_id=test_org.id, user_id=test_user.id)
        db.add(inq)
        await db.flush()

        now = _dt.datetime.now(_dt.timezone.utc)
        await inquiry_event_repo.create(
            db, inquiry_id=inq.id, event_type="received", actor="host",
            occurred_at=now,
        )
        await inquiry_event_repo.create(
            db, inquiry_id=inq.id, event_type="triaged", actor="host",
            occurred_at=now + _dt.timedelta(minutes=5),
        )
        await inquiry_event_repo.create(
            db, inquiry_id=inq.id, event_type="replied", actor="host",
            occurred_at=now + _dt.timedelta(minutes=10),
        )
        await db.commit()

        events = await inquiry_event_repo.list_by_inquiry(db, inq.id)
        assert [e.event_type for e in events] == ["received", "triaged", "replied"]


class TestInquiryEventImmutability:
    def test_repo_does_not_expose_update_or_delete(self) -> None:
        assert not hasattr(inquiry_event_repo, "update"), (
            "inquiry_event_repo must NOT expose update — events are append-only"
        )
        assert not hasattr(inquiry_event_repo, "delete_by_id"), (
            "inquiry_event_repo must NOT expose delete — events are append-only"
        )
        assert not hasattr(inquiry_event_repo, "soft_delete_by_id"), (
            "events are append-only; soft-delete makes no sense"
        )
