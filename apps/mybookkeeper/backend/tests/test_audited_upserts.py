"""Insert-if-absent writes are audited, and still skip duplicates.

These repositories used ``INSERT ... ON CONFLICT DO NOTHING``, which the audit
listener never sees. Each now inserts through the ORM: a new row leaves INSERT
audit rows naming the actor, and a duplicate leaves the existing row as it was
and writes no audit rows at all.
"""
from __future__ import annotations

import uuid

import pytest
from platform_shared.core.audit_actor import audit_actor
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audited_write_case import assert_row_audited
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar.calendar_email_review_queue import CalendarEmailReviewQueue
from app.models.calendar.calendar_listing_blocklist import CalendarListingBlocklist
from app.models.email.email_queue import EmailQueue
from app.repositories.calendar import blocklist_repo, review_queue_repo
from app.repositories.email import email_queue_repo

ORG = uuid.uuid4()
USER = uuid.uuid4()

pytestmark = pytest.mark.usefixtures("audit_listeners")


async def _audit_count(db: AsyncSession, table: str) -> int:
    await db.flush()
    return (await db.execute(
        select(func.count()).select_from(AuditLog).where(AuditLog.table_name == table),
    )).scalar_one()


async def _block(db: AsyncSession, reason: str) -> None:
    await blocklist_repo.insert_if_not_exists(
        db, user_id=USER, organization_id=ORG,
        source_channel="airbnb", source_listing_id="L1", reason=reason,
    )


async def _queue_review(db: AsyncSession, payload: dict) -> CalendarEmailReviewQueue | None:
    return await review_queue_repo.insert_if_not_exists(
        db, user_id=USER, organization_id=ORG,
        email_message_id="m1", source_channel="airbnb", parsed_payload=payload,
    )


async def _queue_email(db: AsyncSession, subject: str) -> None:
    await email_queue_repo.insert_ignore_conflict(
        db, organization_id=ORG, user_id=USER, message_id="m1", sync_log_id=1,
        attachment_id="a1", attachment_filename="f.pdf",
        attachment_content_type="application/pdf", email_subject=subject,
    )


async def test_blocklist_insert_is_audited(db: AsyncSession) -> None:
    with audit_actor(USER):
        await _block(db, "friend's listing")

    row = (await db.execute(select(CalendarListingBlocklist))).scalar_one()
    assert row.reason == "friend's listing"
    await assert_row_audited(
        db, row, operation="INSERT", actor=USER,
        fields=frozenset({"user_id", "source_channel", "source_listing_id", "reason"}),
    )


async def test_blocklist_duplicate_is_a_no_op(db: AsyncSession) -> None:
    await _block(db, "first")
    await db.execute(AuditLog.__table__.delete())

    with audit_actor(USER):
        await _block(db, "second")

    rows = (await db.execute(select(CalendarListingBlocklist))).scalars().all()
    assert [row.reason for row in rows] == ["first"]
    assert await _audit_count(db, "calendar_listing_blocklist") == 0


async def test_review_queue_insert_is_audited_and_returns_the_row(db: AsyncSession) -> None:
    with audit_actor(USER):
        item = await _queue_review(db, {"guest": "A"})

    assert item is not None
    assert (item.status, item.parsed_payload, item.email_message_id) == ("pending", {"guest": "A"}, "m1")
    await assert_row_audited(
        db, item, operation="INSERT", actor=USER,
        fields=frozenset({"user_id", "email_message_id", "status", "parsed_payload"}),
    )


async def test_review_queue_duplicate_returns_none_even_once_resolved(db: AsyncSession) -> None:
    first = await _queue_review(db, {"guest": "A"})
    assert first is not None
    first.status = "resolved"
    await db.flush()
    await db.flush()
    await db.execute(AuditLog.__table__.delete())

    with audit_actor(USER):
        assert await _queue_review(db, {"guest": "B"}) is None

    rows = (await db.execute(select(CalendarEmailReviewQueue))).scalars().all()
    assert [(row.status, row.parsed_payload) for row in rows] == [("resolved", {"guest": "A"})]
    assert await _audit_count(db, "calendar_email_review_queue") == 0


async def test_email_queue_insert_is_audited(db: AsyncSession) -> None:
    with audit_actor(USER):
        await _queue_email(db, "Invoice")

    row = (await db.execute(select(EmailQueue))).scalar_one()
    assert (row.status, row.attempts, row.email_subject) == ("pending", 0, "Invoice")
    await assert_row_audited(
        db, row, operation="INSERT", actor=USER,
        fields=frozenset({"message_id", "attachment_id", "status", "email_subject"}),
    )


async def test_email_queue_duplicate_is_a_no_op(db: AsyncSession) -> None:
    await _queue_email(db, "Invoice")
    await db.execute(AuditLog.__table__.delete())

    with audit_actor(USER):
        await _queue_email(db, "Invoice again")

    rows = (await db.execute(select(EmailQueue))).scalars().all()
    assert [row.email_subject for row in rows] == ["Invoice"]
    assert await _audit_count(db, "email_queue") == 0
