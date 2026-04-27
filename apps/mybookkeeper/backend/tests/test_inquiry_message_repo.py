"""Tests for inquiry_message_repo — append-only semantics + chronological listing."""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inquiries.inquiry import Inquiry
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import inquiry_message_repo


def _seed_inquiry(*, org_id: uuid.UUID, user_id: uuid.UUID) -> Inquiry:
    return Inquiry(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        source="direct", stage="new",
        received_at=_dt.datetime.now(_dt.timezone.utc),
    )


class TestInquiryMessageCreateAndList:
    @pytest.mark.asyncio
    async def test_create_persists(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inq = _seed_inquiry(org_id=test_org.id, user_id=test_user.id)
        db.add(inq)
        await db.flush()

        msg = await inquiry_message_repo.create(
            db,
            inquiry_id=inq.id,
            direction="inbound",
            channel="email",
            from_address="alice@example.com",
            to_address="host@example.com",
            subject="Looking for a room",
            raw_email_body="Hi, I'd love to see your place.",
            email_message_id="msg-1",
        )
        await db.commit()

        rows = await inquiry_message_repo.list_by_inquiry(db, inq.id)
        assert len(rows) == 1
        assert rows[0].id == msg.id
        # PII columns round-trip through the EncryptedString TypeDecorator.
        assert rows[0].from_address == "alice@example.com"
        assert rows[0].to_address == "host@example.com"

    @pytest.mark.asyncio
    async def test_list_orders_chronologically(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inq = _seed_inquiry(org_id=test_org.id, user_id=test_user.id)
        db.add(inq)
        await db.flush()

        now = _dt.datetime.now(_dt.timezone.utc)
        from app.models.inquiries.inquiry_message import InquiryMessage
        db.add_all([
            InquiryMessage(
                inquiry_id=inq.id, direction="inbound", channel="email",
                raw_email_body="third", created_at=now + _dt.timedelta(seconds=2),
            ),
            InquiryMessage(
                inquiry_id=inq.id, direction="inbound", channel="email",
                raw_email_body="first", created_at=now,
            ),
            InquiryMessage(
                inquiry_id=inq.id, direction="outbound", channel="email",
                raw_email_body="second", created_at=now + _dt.timedelta(seconds=1),
            ),
        ])
        await db.commit()

        rows = await inquiry_message_repo.list_by_inquiry(db, inq.id)
        assert [r.raw_email_body for r in rows] == ["first", "second", "third"]

    @pytest.mark.asyncio
    async def test_find_by_email_message_id(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inq = _seed_inquiry(org_id=test_org.id, user_id=test_user.id)
        db.add(inq)
        await db.flush()

        await inquiry_message_repo.create(
            db, inquiry_id=inq.id, direction="inbound", channel="email",
            email_message_id="msg-find-me",
        )
        await db.commit()

        found = await inquiry_message_repo.find_by_email_message_id(db, "msg-find-me")
        assert found is not None
        assert found.email_message_id == "msg-find-me"

        miss = await inquiry_message_repo.find_by_email_message_id(db, "missing")
        assert miss is None


class TestInquiryMessageImmutability:
    """No update method is exposed — verifying via the public surface."""

    def test_repo_module_does_not_export_update(self) -> None:
        # Sanity check: messages are append-only so no `update` symbol exists.
        assert not hasattr(inquiry_message_repo, "update"), (
            "inquiry_message_repo must NOT expose an update function — "
            "InquiryMessage rows are append-only per RENTALS_PLAN.md §5.2"
        )
        assert not hasattr(inquiry_message_repo, "delete_by_id"), (
            "inquiry_message_repo must NOT expose delete — messages are immutable"
        )
