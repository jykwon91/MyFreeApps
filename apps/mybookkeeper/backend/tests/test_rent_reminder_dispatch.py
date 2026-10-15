"""Service-level tests for sending rent reminders.

Runs against the in-memory database with ``unit_of_work`` patched to yield the
test session (the pattern in ``test_rent_ledger_service``). Email and the
httpSMS relay are mocked at the ``app.services.system`` seam; ``now`` is
injected, so nothing depends on the real clock except the repository's own
``sent_at`` stamps, which the watchdog test accounts for.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import ExitStack, asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from platform_shared.services.sms_service import SmsSendError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.rent.rent_charge import RentCharge
from app.models.rent.rent_reminder_plan import RentReminderPlan
from app.models.rent.rent_reminder_send import RentReminderSend
from app.models.rent.rent_schedule import RentSchedule
from app.services.rent import (
    rent_ledger_service,
    rent_reminder_dispatch_service as dispatch,
    rent_reminder_math as math,
    rent_reminder_planner as planner,
    rent_reminder_service,
    rent_reminder_webhook_service as webhook,
    rent_schedule_service,
)
from app.services.system import email_service, sms_service

ORG = uuid.uuid4()
USER = uuid.uuid4()
UTC = _dt.timezone.utc
# Saturday Oct 31 2026, 6:30pm Chicago (CDT) — Sonu's reminder for Sunday Nov 1.
SATURDAY_EVENING = _dt.datetime(2026, 10, 31, 23, 30, tzinfo=UTC)


def _fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


@pytest.fixture()
def wired(db: AsyncSession):
    """Route every reminder module's transactions into the test session and
    mock the outside world. Yields the email/SMS mocks."""
    fake = _fake_uow(db)
    send_email_or_raise = MagicMock()
    send_email = MagicMock(return_value=True)
    sms_send = MagicMock(return_value="httpsms-msg-1")
    with ExitStack() as stack:
        for target in (
            "app.services.rent.rent_reminder_dispatch_service.unit_of_work",
            "app.services.rent.rent_reminder_service.unit_of_work",
            "app.services.rent.rent_reminder_webhook_service.unit_of_work",
        ):
            stack.enter_context(patch(target, fake))
        stack.enter_context(
            patch.object(dispatch, "_operator_email", AsyncMock(return_value="jason@example.com")),
        )
        stack.enter_context(patch.object(email_service, "send_email_or_raise", send_email_or_raise))
        stack.enter_context(patch.object(email_service, "send_email", send_email))
        stack.enter_context(patch.object(sms_service, "is_configured", lambda: True))
        stack.enter_context(patch.object(sms_service, "send_or_raise", sms_send))
        yield {"email": send_email_or_raise, "alert": send_email, "sms": sms_send}


async def _tenant(db: AsyncSession) -> uuid.UUID:
    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=ORG,
        user_id=USER,
        stage="lease_signed",
        legal_name="Sonu Patel",
        contact_email="sonu@example.com",
        contact_phone="(713) 555-0100",
    )
    db.add(applicant)
    await db.flush()
    return applicant.id


async def _schedule(db: AsyncSession, applicant_id: uuid.UUID, **kwargs) -> None:
    db.add(
        RentSchedule(
            id=uuid.uuid4(),
            organization_id=ORG,
            user_id=USER,
            applicant_id=applicant_id,
            amount=Decimal(kwargs.get("amount", "1500.00")),
            cadence="monthly",
            start_date=kwargs.get("start", _dt.date(2026, 1, 1)),
            end_date=kwargs.get("end"),
        ),
    )
    await db.flush()


async def _plan(db: AsyncSession, applicant_id: uuid.UUID, **fields) -> RentReminderPlan:
    plan = RentReminderPlan(
        id=uuid.uuid4(),
        organization_id=ORG,
        user_id=USER,
        applicant_id=applicant_id,
        frequency=fields.get("frequency", "weekly"),
        due_weekday=fields.get("due_weekday", 6),
        send_days_before=fields.get("send_days_before", 1),
        send_time=_dt.time(18, 0),
        timezone="America/Chicago",
        email_enabled=fields.get("email_enabled", True),
        sms_enabled=fields.get("sms_enabled", False),
        payment_instructions="Zelle to jason@example.com",
        is_active=True,
    )
    db.add(plan)
    await db.flush()
    return plan


async def _sends(db: AsyncSession) -> list[RentReminderSend]:
    return list((await db.execute(select(RentReminderSend))).scalars().all())


class TestProjectionMatchesGenerator:
    @pytest.mark.asyncio
    async def test_projected_amounts_equal_written_charges(self, db: AsyncSession) -> None:
        """What a reminder quotes ahead of time is exactly what the ledger later charges."""
        applicant_id = await _tenant(db)
        fake = _fake_uow(db)
        with patch.object(rent_ledger_service, "_today", lambda: _dt.date(2026, 10, 15)), \
                patch("app.services.rent.rent_ledger_service.unit_of_work", fake), \
                patch("app.services.rent.rent_schedule_service.unit_of_work", fake):
            await rent_schedule_service.create_schedule(
                organization_id=ORG, user_id=USER, applicant_id=applicant_id,
                amount=Decimal("1500.00"), cadence="monthly",
                start_date=_dt.date(2026, 10, 15), end_date=_dt.date(2026, 11, 15),
            )
            schedule = (await db.execute(select(RentSchedule))).scalar_one()
            # Only Oct exists so far; project Nov before generating it.
            projected = math.projected_periods(
                math.ScheduleTerms(
                    id=schedule.id, amount=schedule.amount, cadence=schedule.cadence,
                    start_date=schedule.start_date, end_date=schedule.end_date,
                ),
                _dt.date(2026, 10, 1), _dt.date(2026, 12, 31),
            )
            await rent_ledger_service.ensure_charges_generated(
                db, organization_id=ORG, applicant_id=applicant_id,
                through=_dt.date(2026, 12, 31),
            )
        charges = (
            await db.execute(
                select(RentCharge)
                .where(RentCharge.deleted_at.is_(None))
                .order_by(RentCharge.period_start),
            )
        ).scalars().all()
        assert [(p.period_start, p.period_end, p.amount) for p in projected] == [
            (c.period_start, c.period_end, c.amount) for c in charges
        ]
        assert [p.amount for p in projected] == [Decimal("822.58"), Decimal("750.00")]


class TestScheduledSend:
    @pytest.mark.asyncio
    async def test_sends_once_and_is_idempotent(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)

        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 1
        assert await dispatch.run_due_reminders(SATURDAY_EVENING + _dt.timedelta(hours=1)) == 0

        wired["email"].assert_called_once()
        to, subject, body = wired["email"].call_args.args
        assert to == ["sonu@example.com"]
        assert "$300" in subject
        assert "Hi Sonu, reminder: rent of $300 is due tomorrow (Sunday)." in body
        assert wired["email"].call_args.kwargs["reply_to"] == "jason@example.com"
        [row] = await _sends(db)
        assert (row.status, row.due_date, row.amount) == (
            "sent", _dt.date(2026, 11, 1), Decimal("300.00"),
        )

    @pytest.mark.asyncio
    async def test_nothing_before_send_time(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)

        assert await dispatch.run_due_reminders(SATURDAY_EVENING - _dt.timedelta(hours=1)) == 0
        wired["email"].assert_not_called()
        assert await _sends(db) == []

    @pytest.mark.asyncio
    async def test_monthly_payer_reminded_three_days_ahead(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, frequency="monthly", due_weekday=None, send_days_before=3)

        # Thursday Oct 29, 6:05pm Chicago.
        assert await dispatch.run_due_reminders(_dt.datetime(2026, 10, 29, 23, 5, tzinfo=UTC)) == 1
        [row] = await _sends(db)
        assert (row.due_date, row.amount) == (_dt.date(2026, 11, 1), Decimal("1500.00"))

    async def _failed_row(
        self, db: AsyncSession, plan: RentReminderPlan, *, failed_at: _dt.datetime,
    ) -> None:
        db.add(
            RentReminderSend(
                id=uuid.uuid4(), plan_id=plan.id, applicant_id=plan.applicant_id,
                organization_id=ORG, user_id=USER, due_date=_dt.date(2026, 11, 1),
                channel="email", status="failed", amount=Decimal("300.00"),
                message_body="early attempt", error_code="no_contact",
                created_at=failed_at, updated_at=failed_at,
            ),
        )
        await db.flush()

    @pytest.mark.asyncio
    async def test_early_manual_failure_does_not_swallow_scheduled_send(
        self, db: AsyncSession, wired,
    ) -> None:
        """A "Send now" that failed on Thursday (e.g. no email on file yet) is
        retried when Saturday's scheduled moment arrives."""
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        plan = await _plan(db, applicant_id)
        await self._failed_row(db, plan, failed_at=_dt.datetime(2026, 10, 29, 15, 0, tzinfo=UTC))

        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 1
        wired["email"].assert_called_once()
        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("sent", None)

    @pytest.mark.asyncio
    async def test_failure_after_scheduled_moment_is_not_retried(
        self, db: AsyncSession, wired,
    ) -> None:
        """The scheduled attempt itself failing is final — no hourly retry loop."""
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        plan = await _plan(db, applicant_id)
        await self._failed_row(db, plan, failed_at=SATURDAY_EVENING)

        assert await dispatch.run_due_reminders(SATURDAY_EVENING + _dt.timedelta(hours=1)) == 0
        wired["email"].assert_not_called()

    @pytest.mark.asyncio
    async def test_one_bad_plan_does_not_stop_the_sweep(self, db: AsyncSession, wired) -> None:
        first = await _tenant(db)
        second = await _tenant(db)
        for applicant_id in (first, second):
            await _schedule(db, applicant_id)
            await _plan(db, applicant_id)

        real = planner.next_due_for_plan
        calls = {"n": 0}

        async def flaky(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("boom")
            return await real(*args, **kwargs)

        with patch.object(planner, "next_due_for_plan", flaky):
            assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 1


class TestSms:
    @pytest.mark.asyncio
    async def test_handed_to_phone_then_confirmed_by_webhook(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)

        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 1
        [row] = await _sends(db)
        to, body = wired["sms"].call_args.args
        assert to == "+17135550100"
        assert body.startswith("Hi Sonu, reminder: rent of $300")
        assert wired["sms"].call_args.kwargs["request_id"] == str(row.id)
        assert (row.status, row.provider_message_id) == ("sent_to_phone", "httpsms-msg-1")

        changed = await webhook.handle_event(
            {"type": "message.phone.delivered", "data": {"id": "httpsms-msg-1", "request_id": str(row.id)}},
            event_type_header=None,
        )
        assert changed
        assert row.status == "delivered"
        # Out-of-order "sent" after "delivered" changes nothing.
        assert not await webhook.handle_event(
            {"type": "message.phone.sent", "data": {"id": "httpsms-msg-1"}},
            event_type_header=None,
        )
        assert row.status == "delivered"

    @pytest.mark.asyncio
    async def test_provider_error_fails_row_and_alerts_once(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        wired["sms"].side_effect = SmsSendError("rejected", status=422, provider_code="http_422")

        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 0
        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("failed", "sms_http_422")
        assert row.operator_alerted_at is not None
        wired["alert"].assert_called_once()
        assert wired["alert"].call_args.args[0] == ["jason@example.com"]

    @pytest.mark.asyncio
    async def test_phone_reported_failure(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        await dispatch.run_due_reminders(SATURDAY_EVENING)
        [row] = await _sends(db)

        await webhook.handle_event(
            {"type": "message.send.failed", "data": {"id": "httpsms-msg-1", "error_message": "RESULT_ERROR_NO_SERVICE"}},
            event_type_header=None,
        )
        assert row.status == "failed"
        assert row.error_code == "phone_failed: RESULT_ERROR_NO_SERVICE"
        wired["alert"].assert_called_once()


class TestWatchdog:
    @pytest.mark.asyncio
    async def test_unconfirmed_text_fails_and_alerts_once(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        await dispatch.run_due_reminders(SATURDAY_EVENING)
        [row] = await _sends(db)

        # ``sent_at`` is stamped with the real clock; judge relative to it.
        assert await dispatch.run_watchdog(row.sent_at.replace(tzinfo=UTC) + _dt.timedelta(minutes=30)) == 0
        later = row.sent_at.replace(tzinfo=UTC) + _dt.timedelta(minutes=61)
        assert await dispatch.run_watchdog(later) == 1
        assert await dispatch.run_watchdog(later) == 0

        assert (row.status, row.error_code) == ("failed", "no_phone_confirmation")
        wired["alert"].assert_called_once()
        subject = wired["alert"].call_args.args[1]
        body = wired["alert"].call_args.args[2]
        assert subject == "Sonu's rent text didn't go out"
        assert "battery-optimized" in body

    @pytest.mark.asyncio
    async def test_late_confirmation_overrides_the_watchdog(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        await dispatch.run_due_reminders(SATURDAY_EVENING)
        [row] = await _sends(db)
        await dispatch.run_watchdog(row.sent_at.replace(tzinfo=UTC) + _dt.timedelta(hours=2))

        await webhook.handle_event(
            {"type": "message.phone.sent", "data": {"id": "httpsms-msg-1"}},
            event_type_header=None,
        )
        assert (row.status, row.error_code) == ("sent", None)


class TestChannelsGoTogether:
    @pytest.mark.asyncio
    async def test_both_channels_go_in_the_same_pass(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, sms_enabled=True)

        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 2
        assert sorted(r.channel for r in await _sends(db)) == ["email", "sms"]

    @pytest.mark.asyncio
    async def test_text_switched_on_after_email_went_waits_for_next_due_date(
        self, db: AsyncSession, wired,
    ) -> None:
        """Nicole, 2026-10-15: email went at its moment, text enabled an hour
        later. The text must not trail behind alone — it starts next time."""
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        plan = await _plan(db, applicant_id)
        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 1

        plan.sms_enabled = True
        await db.flush()
        assert await dispatch.run_due_reminders(SATURDAY_EVENING + _dt.timedelta(hours=1)) == 0
        wired["sms"].assert_not_called()

        # Next Sunday's reminder goes out on both (6:30pm CST, after DST ends).
        assert await dispatch.run_due_reminders(_dt.datetime(2026, 11, 8, 0, 30, tzinfo=UTC)) == 2
        wired["sms"].assert_called_once()


class TestSendNow:
    _NOW = _dt.datetime(2026, 10, 27, 15, 0, tzinfo=UTC)  # Tuesday morning

    async def _send_now(self, applicant_id: uuid.UUID):
        return await dispatch.send_now(
            organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=self._NOW,
        )

    @pytest.mark.asyncio
    async def test_sends_every_enabled_channel_then_refuses_a_duplicate(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, sms_enabled=True)

        results = await self._send_now(applicant_id)
        assert [(r.channel, r.status) for r in results] == [
            ("email", "sent"), ("sms", "sent_to_phone"),
        ]
        assert {r.due_date for r in results} == {_dt.date(2026, 11, 1)}
        with pytest.raises(dispatch.ReminderAlreadySentError):
            await self._send_now(applicant_id)

    @pytest.mark.asyncio
    async def test_refused_once_any_channel_went_out(self, db: AsyncSession, wired) -> None:
        """Email already went; switching text on must not let send-now send it alone."""
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        plan = await _plan(db, applicant_id)
        await self._send_now(applicant_id)

        plan.sms_enabled = True
        await db.flush()
        with pytest.raises(dispatch.ReminderAlreadySentError):
            await self._send_now(applicant_id)
        wired["sms"].assert_not_called()

    @pytest.mark.asyncio
    async def test_retries_a_failed_row(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        wired["email"].side_effect = [RuntimeError("smtp down"), None]

        [first] = await self._send_now(applicant_id)
        assert first.status == "failed"
        [retry] = await self._send_now(applicant_id)
        assert (retry.status, retry.id) == ("sent", first.id)

    @pytest.mark.asyncio
    async def test_preview_matches_what_will_be_sent(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)

        preview = await rent_reminder_service.get_preview(
            organization_id=ORG, user_id=USER, applicant_id=applicant_id,
            now=_dt.datetime(2026, 10, 27, 15, 0, tzinfo=UTC),
        )
        assert preview is not None
        assert preview.due_date == _dt.date(2026, 11, 1)
        assert preview.amount == Decimal("300.00")
        assert preview.message == (
            "Hi Sonu, reminder: rent of $300 is due tomorrow (Sunday). "
            "Pay via Zelle to jason@example.com."
        )
        assert preview.sent_channels == []
