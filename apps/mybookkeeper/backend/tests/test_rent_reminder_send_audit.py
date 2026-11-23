"""Every status change on a rent reminder send is audited, as the reminder's owner.

The repository used to change these rows with bulk ``UPDATE`` statements, which
the audit listener never sees, so a reminder's history (queued, sent, failed,
retried, alerted) left no audit rows at all. Each write is still conditional on
the row being as the caller read it: a row someone else changed since is left
alone and leaves no audit rows.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import ExitStack, asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.core.audit_actor import audit_actor
from platform_shared.db.models.audit_log import AuditLog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.rent.rent_reminder_send import RentReminderSend
from app.repositories.rent import rent_reminder_send_repo as repo
from app.services.rent import rent_reminder_alert_service as alerts
from app.services.rent import rent_reminder_watchdog_service as watchdog
from app.services.rent import rent_reminder_webhook_service as webhook
from app.services.system import email_service

pytestmark = pytest.mark.usefixtures("audit_listeners")

UTC = _dt.UTC
TABLE = "rent_reminder_sends"


async def _send(db: AsyncSession, *, owner: uuid.UUID, **fields: object) -> RentReminderSend:
    org_id = uuid.uuid4()
    applicant = Applicant(
        organization_id=org_id, user_id=owner, stage="lease_signed", legal_name="Sonu Patel",
    )
    db.add(applicant)
    await db.flush()
    row = RentReminderSend(
        plan_id=uuid.uuid4(), applicant_id=applicant.id, organization_id=org_id, user_id=owner,
        due_date=_dt.date(2026, 11, 1), channel=fields.pop("channel", "sms"),
        status=fields.pop("status", "queued"), amount=Decimal("1500.00"),
        message_body="Rent is due", **fields,
    )
    db.add(row)
    await db.flush()
    await db.flush()  # the listener's INSERT audit rows are written on the next flush
    await db.execute(AuditLog.__table__.delete())
    return row


async def _updates(db: AsyncSession, row: RentReminderSend) -> dict[str, tuple[str | None, str | None]]:
    """``field -> (old, new)`` of the UPDATE audit rows for ``row``."""
    result = await db.execute(
        select(AuditLog).where(
            AuditLog.table_name == TABLE,
            AuditLog.record_id == str(row.id),
            AuditLog.operation == "UPDATE",
        ),
    )
    return {log.field_name: (log.old_value, log.new_value) for log in result.scalars()}


async def _actors(db: AsyncSession, row: RentReminderSend) -> set[str | None]:
    result = await db.execute(
        select(AuditLog.changed_by).where(AuditLog.table_name == TABLE, AuditLog.record_id == str(row.id)),
    )
    return set(result.scalars())


async def _change_behind_the_callers_back(db: AsyncSession, row: RentReminderSend, **values: object) -> None:
    """Another writer (the webhook, the watchdog, a retry) changes the row.

    ``synchronize_session=False`` leaves the caller's copy as it read it.
    """
    await db.execute(
        update(RentReminderSend).where(RentReminderSend.id == row.id).values(**values)
        .execution_options(synchronize_session=False),
    )
    await db.execute(AuditLog.__table__.delete())


# --------------------------------------------------------------------------
# Each write is audited
# --------------------------------------------------------------------------


async def test_mark_sent_to_phone_is_audited(db: AsyncSession) -> None:
    owner = uuid.uuid4()
    row = await _send(db, owner=owner)

    with audit_actor(owner):
        assert await repo.mark_sent_to_phone(db, row=row, attempt=1, provider_message_id="msg-1")

    changes = await _updates(db, row)
    assert changes["status"] == ("queued", "sent_to_phone")
    assert changes["provider_message_id"] == (None, "msg-1")
    assert "sent_at" in changes
    assert await _actors(db, row) == {str(owner)}


async def test_mark_sent_is_audited(db: AsyncSession) -> None:
    owner = uuid.uuid4()
    row = await _send(db, owner=owner, channel="email")

    with audit_actor(owner):
        assert await repo.mark_sent(db, row=row, attempt=1)

    assert (await _updates(db, row))["status"] == ("queued", "sent")
    assert await _actors(db, row) == {str(owner)}


async def test_mark_failed_is_audited(db: AsyncSession) -> None:
    owner = uuid.uuid4()
    row = await _send(db, owner=owner)

    with audit_actor(owner):
        assert await repo.mark_failed(db, row=row, error_code="send_interrupted", seen_status="queued", seen_attempt=1)

    changes = await _updates(db, row)
    assert changes["status"] == ("queued", "failed")
    assert changes["error_code"] == (None, "send_interrupted")
    assert await _actors(db, row) == {str(owner)}


async def test_confirm_if_unchanged_is_audited(db: AsyncSession) -> None:
    owner = uuid.uuid4()
    row = await _send(db, owner=owner, status="sent_to_phone")

    with audit_actor(owner):
        assert await repo.confirm_if_unchanged(
            db, row=row, status="delivered", seen_status="sent_to_phone", seen_error_code=None, seen_attempt=1,
        )

    changes = await _updates(db, row)
    assert changes["status"] == ("sent_to_phone", "delivered")
    assert "confirmed_at" in changes
    assert await _actors(db, row) == {str(owner)}


async def test_fail_if_unchanged_is_audited(db: AsyncSession) -> None:
    owner = uuid.uuid4()
    row = await _send(db, owner=owner, status="sent_to_phone")

    with audit_actor(owner):
        assert await repo.fail_if_unchanged(
            db, row=row, error_code="phone_failed: no service",
            seen_status="sent_to_phone", seen_error_code=None, seen_attempt=1,
        )

    changes = await _updates(db, row)
    assert changes["status"] == ("sent_to_phone", "failed")
    assert changes["error_code"] == (None, "phone_failed: no service")
    assert await _actors(db, row) == {str(owner)}


async def test_requeue_is_audited(db: AsyncSession) -> None:
    owner = uuid.uuid4()
    row = await _send(db, owner=owner, status="failed", error_code="send_interrupted")

    with audit_actor(owner):
        retried = await repo.requeue(
            db, row=row, seen_attempt=1, seen_error_code="send_interrupted",
            amount=Decimal("1600.00"), message_body="Rent is due (updated)",
        )

    assert retried is row
    changes = await _updates(db, row)
    assert changes["status"] == ("failed", "queued")
    assert changes["attempt"] == ("1", "2")
    assert changes["error_code"] == ("send_interrupted", None)
    assert changes["amount"] == ("1500.00", "1600.00")
    assert await _actors(db, row) == {str(owner)}


async def test_claim_and_release_operator_alert_are_audited(db: AsyncSession) -> None:
    owner = uuid.uuid4()
    row = await _send(db, owner=owner, status="failed", error_code="send_interrupted")

    with audit_actor(owner):
        claimed_at = await repo.claim_operator_alert(db, row=row, attempt=1)
    assert claimed_at is not None
    assert (await _updates(db, row))["operator_alerted_at"][0] is None

    await db.execute(AuditLog.__table__.delete())
    with audit_actor(owner):
        await repo.release_operator_alert(db, row=row, attempt=1, claimed_at=claimed_at)
    assert (await _updates(db, row))["operator_alerted_at"][1] is None
    assert row.operator_alerted_at is None
    assert await _actors(db, row) == {str(owner)}


# --------------------------------------------------------------------------
# The writes stay conditional
# --------------------------------------------------------------------------


async def test_a_row_the_phone_confirmed_meanwhile_is_not_marked_failed(db: AsyncSession) -> None:
    row = await _send(db, owner=uuid.uuid4(), status="sent_to_phone")
    await _change_behind_the_callers_back(db, row, status="delivered")
    assert row.status == "sent_to_phone"  # what the watchdog read

    assert not await repo.mark_failed(
        db, row=row, error_code="no_phone_confirmation", seen_status="sent_to_phone", seen_attempt=1,
    )

    assert (row.status, row.error_code) == ("delivered", None)  # refreshed to what's stored
    assert await _updates(db, row) == {}


async def test_a_retry_someone_else_started_is_not_requeued_twice(db: AsyncSession) -> None:
    row = await _send(db, owner=uuid.uuid4(), status="failed", error_code="send_interrupted")
    await _change_behind_the_callers_back(db, row, status="queued", attempt=2, error_code=None)

    with pytest.raises(repo.ReminderAlreadyClaimedError):
        await repo.requeue(
            db, row=row, seen_attempt=1, seen_error_code="send_interrupted",
            amount=Decimal("1500.00"), message_body="Rent is due",
        )

    stored = (await db.execute(
        select(RentReminderSend.status, RentReminderSend.attempt).where(RentReminderSend.id == row.id),
    )).one()
    assert tuple(stored) == ("queued", 2)
    assert await _updates(db, row) == {}


async def test_an_alert_already_claimed_is_not_claimed_again(db: AsyncSession) -> None:
    row = await _send(db, owner=uuid.uuid4(), status="failed", error_code="send_interrupted")
    first_claim = _dt.datetime(2026, 11, 1, 12, 0, tzinfo=UTC)
    await _change_behind_the_callers_back(db, row, operator_alerted_at=first_claim)

    assert await repo.claim_operator_alert(db, row=row, attempt=1) is None
    assert row.operator_alerted_at is not None
    assert await _updates(db, row) == {}


async def test_release_leaves_a_newer_claim_alone(db: AsyncSession) -> None:
    row = await _send(db, owner=uuid.uuid4(), status="failed", error_code="send_interrupted")
    ours = await repo.claim_operator_alert(db, row=row, attempt=1)
    assert ours is not None
    newer = ours + _dt.timedelta(minutes=5)
    await _change_behind_the_callers_back(db, row, operator_alerted_at=newer)

    await repo.release_operator_alert(db, row=row, attempt=1, claimed_at=ours)

    assert row.operator_alerted_at is not None
    assert row.operator_alerted_at.replace(tzinfo=UTC) == newer
    assert await _updates(db, row) == {}


# --------------------------------------------------------------------------
# Jobs with no signed-in user audit as the reminder's owner
# --------------------------------------------------------------------------


@pytest.fixture()
def jobs_wired(db: AsyncSession) -> Iterator[AsyncMock]:
    @asynccontextmanager
    async def _uow():  # type: ignore[no-untyped-def]
        yield db

    send_email = AsyncMock(return_value=True)
    with ExitStack() as stack:
        for target in (
            "app.services.rent.rent_reminder_alert_service.unit_of_work",
            "app.services.rent.rent_reminder_watchdog_service.unit_of_work",
            "app.services.rent.rent_reminder_webhook_service.unit_of_work",
        ):
            stack.enter_context(patch(target, _uow))
        stack.enter_context(patch.object(alerts, "operator_email", AsyncMock(return_value="host@example.com")))
        stack.enter_context(patch.object(email_service, "send_email", send_email))
        yield send_email


async def test_the_watchdog_audits_each_failure_and_alert_as_the_owner(
    db: AsyncSession, jobs_wired: AsyncMock,
) -> None:
    long_ago = _dt.datetime(2026, 11, 1, 0, 0, tzinfo=UTC)
    owner_a, owner_b = uuid.uuid4(), uuid.uuid4()
    row_a = await _send(db, owner=owner_a, status="sent_to_phone", sent_at=long_ago, created_at=long_ago)
    row_b = await _send(db, owner=owner_b, created_at=long_ago)

    assert await watchdog.run_watchdog(long_ago + _dt.timedelta(days=1)) == 2

    assert jobs_wired.await_count == 2
    for row, owner in ((row_a, owner_a), (row_b, owner_b)):
        changes = await _updates(db, row)
        assert changes["status"][1] == "failed"
        assert changes["operator_alerted_at"][0] is None  # the alert claim
        assert await _actors(db, row) == {str(owner)}


async def test_the_phone_webhook_audits_as_the_owner(db: AsyncSession, jobs_wired: AsyncMock) -> None:
    owner = uuid.uuid4()
    row = await _send(db, owner=owner, status="sent_to_phone", provider_message_id="msg-1")

    assert await webhook.handle_event(
        {"type": "message.send.failed", "data": {"request_id": f"{row.id}:1", "error_message": "NO_SERVICE"}},
        event_type_header=None,
    )

    changes = await _updates(db, row)
    assert changes["status"] == ("sent_to_phone", "failed")
    assert changes["operator_alerted_at"][0] is None  # the alert claim
    assert jobs_wired.await_count == 1
    assert await _actors(db, row) == {str(owner)}
