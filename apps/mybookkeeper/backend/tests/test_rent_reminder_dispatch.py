"""Service-level tests for sending rent reminders.

Runs against the in-memory database with ``unit_of_work`` patched to yield the
test session (the pattern in ``test_rent_ledger_service``). Email and the
httpSMS relay are mocked at the ``app.services.system`` seam; ``now`` is
injected, so nothing depends on the real clock except a row's own ``sent_at``
and ``updated_at`` stamps. The watchdog test judges relative to ``sent_at``.
The sweep reads ``updated_at`` as when a try failed, so tests of a try that
failed before its scheduled moment set ``updated_at`` themselves
(``_failed_row``).
"""
from __future__ import annotations

import datetime as _dt
import html
import io
import logging
import smtplib
import uuid
from contextlib import ExitStack, asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import httpx
import pytest
from platform_shared.services.email_service import EmailSendError, EmailService
from platform_shared.services.httpsms_service import HttpSmsService
from platform_shared.services.sms_service import SmsSendError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rent_reminder_constants import (
    ERROR_NO_RECIPIENT,
    MAY_STILL_ARRIVE_ERRORS,
    REMINDER_ERROR_CODES,
    SMS_CONFIRMATION_TIMEOUT_MINUTES,
)
from app.core.rent_reminder_enums import RENT_REMINDER_CHANNELS
from app.models.applicants.applicant import Applicant
from app.models.rent.rent_charge import RentCharge
from app.models.rent.rent_reminder_plan import RentReminderPlan
from app.models.rent.rent_reminder_send import RentReminderSend
from app.models.rent.rent_schedule import RentSchedule
from app.repositories.rent import rent_reminder_send_repo
from app.schemas.rent.rent_reminder_possibly_sent import RentReminderPossiblySent
from app.services.rent import (
    rent_ledger_service,
    rent_reminder_alert_service as alerts,
    rent_reminder_dispatch_service as dispatch,
    rent_reminder_math as math,
    rent_reminder_planner as planner,
    rent_reminder_service,
    rent_reminder_watchdog_service as watchdog,
    rent_reminder_webhook_service as webhook,
    rent_schedule_service,
)
from app.services.rent.rent_reminder_outbound import ReminderOutbound
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
    send_email_or_raise = AsyncMock()
    send_email = AsyncMock(return_value=True)
    sms_send = MagicMock(return_value="httpsms-msg-1")
    with ExitStack() as stack:
        for target in (
            "app.services.rent.rent_reminder_alert_service.unit_of_work",
            "app.services.rent.rent_reminder_dispatch_service.unit_of_work",
            "app.services.rent.rent_reminder_service.unit_of_work",
            "app.services.rent.rent_reminder_watchdog_service.unit_of_work",
            "app.services.rent.rent_reminder_webhook_service.unit_of_work",
        ):
            stack.enter_context(patch(target, fake))
        stack.enter_context(
            patch.object(alerts, "operator_email", AsyncMock(return_value="jason@example.com")),
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


def _last_alert(wired: dict[str, Mock]) -> tuple[str, str]:
    """The last operator alert's subject and body, unescaped as the operator reads it."""
    _to, subject, body_html = wired["alert"].call_args.args
    return subject, html.unescape(body_html)



class TestProjectionMatchesGenerator:
    @pytest.mark.asyncio
    async def test_projected_amounts_equal_written_charges(self, db: AsyncSession) -> None:
        """What a reminder quotes ahead of time is exactly what the ledger later charges."""
        applicant_id = await _tenant(db)
        fake = _fake_uow(db)
        with patch("app.services.rent.rent_ledger_service.unit_of_work", fake), \
                patch("app.services.rent.rent_schedule_service.unit_of_work", fake):
            await rent_schedule_service.create_schedule(
                organization_id=ORG, user_id=USER, applicant_id=applicant_id,
                amount=Decimal("1500.00"), cadence="monthly",
                start_date=_dt.date(2026, 10, 15), end_date=_dt.date(2026, 11, 15),
                today=_dt.date(2026, 10, 15),
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


class _OfflineSmtp(smtplib.SMTP):
    """Real smtplib command encoding over a fake socket that answers 250.

    It can't finish a send: smtplib wants a 354 after DATA, so a real
    ``sendmail`` through it raises ``SMTPDataError(250)``. Tests use it to fail
    a step before that.
    """

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        super().__init__()
        self.sock = MagicMock()
        self.file = io.BytesIO(b"250 ok\r\n" * 10)
        self.ehlo_resp = b"ok"
        self.esmtp_features = {}

    def starttls(self, *_args: object, **_kwargs: object) -> tuple[int, bytes]:
        return 220, b"ready"

    def login(self, *_args: object, **_kwargs: object) -> tuple[int, bytes]:
        return 235, b"ok"


class TestScheduledSend:
    @pytest.mark.asyncio
    async def test_unsendable_address_is_an_email_send_failure(
        self, db: AsyncSession, wired,
    ) -> None:
        # smtplib sends addresses as ASCII; a non-ASCII one used to escape as
        # UnicodeEncodeError and be recorded as an unexpected crash.
        applicant_id = await _tenant(db)
        applicant = await db.get(Applicant, applicant_id)
        applicant.contact_email = "jos\u00e9@example.com"
        await db.flush()
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        real = EmailService(smtp_host="smtp.example.com", smtp_user="u@example.com", smtp_password="p")
        wired["email"].side_effect = real.send_or_raise_async

        with patch("smtplib.SMTP", _OfflineSmtp):
            assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 0
        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("failed", "email_send_failed")

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
        self,
        db: AsyncSession,
        plan: RentReminderPlan,
        *,
        failed_at: _dt.datetime,
        channel: str = "email",
        error_code: str = "no_contact",
    ) -> None:
        db.add(
            RentReminderSend(
                id=uuid.uuid4(), plan_id=plan.id, applicant_id=plan.applicant_id,
                organization_id=ORG, user_id=USER, due_date=_dt.date(2026, 11, 1),
                channel=channel, status="failed", amount=Decimal("300.00"),
                message_body="early attempt", error_code=error_code,
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
    @pytest.mark.parametrize(
        ("channel", "code"),
        [
            ("sms", "sms_outcome_unknown"),
            ("sms", "send_interrupted"),
            ("sms", "no_phone_confirmation"),
            ("email", "email_outcome_unknown"),
            ("email", "send_interrupted"),
        ],
    )
    async def test_early_send_now_that_may_still_arrive_is_not_retried(
        self, db: AsyncSession, wired, channel: str, code: str,
    ) -> None:
        """An early "Send now" try nobody confirmed (the relay, the phone or the
        mail server) may already have reached the tenant, so the scheduled
        sweep must not send it again."""
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        plan = await _plan(
            db, applicant_id, email_enabled=channel == "email", sms_enabled=channel == "sms",
        )
        await self._failed_row(
            db, plan, failed_at=_dt.datetime(2026, 10, 29, 15, 0, tzinfo=UTC),
            channel=channel, error_code=code,
        )

        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 0
        wired[channel].assert_not_called()
        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("failed", code)

    @pytest.mark.asyncio
    async def test_early_text_that_never_reached_the_relay_is_retried(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        plan = await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        await self._failed_row(
            db, plan, failed_at=_dt.datetime(2026, 10, 29, 15, 0, tzinfo=UTC),
            channel="sms", error_code="sms_network_error",
        )

        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 1
        wired["sms"].assert_called_once()

    @pytest.mark.asyncio
    async def test_a_retry_send_now_made_meanwhile_is_not_sent_again(
        self, db: AsyncSession, wired,
    ) -> None:
        """The sweep judged try 1 safe to retry; before it requeued, Send now
        retried it and try 2 ended unsure. The sweep must not send try 3."""
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        plan = await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        await self._failed_row(
            db, plan, failed_at=_dt.datetime(2026, 10, 29, 15, 0, tzinfo=UTC),
            channel="sms", error_code="sms_network_error",
        )
        wired["sms"].side_effect = SmsSendError(
            "no answer", provider_code="outcome_unknown", outcome_unknown=True,
        )
        send_now_ran: list[bool] = []

        async def operator_email(db_: AsyncSession, user_id: uuid.UUID) -> str:
            # The sweep asks for this after deciding what to retry.
            if not send_now_ran:
                send_now_ran.append(True)
                [result] = await _send_now(applicant_id)
                assert (result.status, result.error_code) == ("failed", "sms_outcome_unknown")
            return "jason@example.com"

        with patch.object(alerts, "operator_email", operator_email):
            assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 0

        assert send_now_ran
        wired["sms"].assert_called_once()
        [row] = await _sends(db)
        assert (row.status, row.error_code, row.attempt) == ("failed", "sms_outcome_unknown", 2)

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
        assert wired["sms"].call_args.kwargs["request_id"] == f"{row.id}:1"
        assert (row.status, row.provider_message_id) == ("sent_to_phone", "httpsms-msg-1")

        changed = await webhook.handle_event(
            {"type": "message.phone.delivered", "data": {"id": "httpsms-msg-1", "request_id": f"{row.id}:1"}},
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

    @staticmethod
    def _real_httpsms_failing_with(error: httpx.HTTPError):
        """The real shared httpSMS sender, with only the HTTP call failing."""
        def send(to: str, body: str, *, request_id: str) -> str:
            with patch("platform_shared.services.httpsms_service.httpx.post", side_effect=error):
                return HttpSmsService(
                    api_key="test-key", from_number="+15551230000",
                ).send_or_raise(to, body, request_id=request_id)
        return send

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "error,code",
        [
            (httpx.ReadTimeout("timed out"), "sms_outcome_unknown"),
            (httpx.RemoteProtocolError("server disconnected"), "sms_outcome_unknown"),
            (httpx.ConnectError("connection refused"), "sms_network_error"),
            (httpx.ConnectTimeout("timed out"), "sms_network_error"),
        ],
        ids=["read_timeout", "disconnected", "refused", "connect_timeout"],
    )
    async def test_relay_failure_is_recorded_as_not_sent_or_unknown(
        self, db: AsyncSession, wired, error: httpx.HTTPError, code: str,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        wired["sms"].side_effect = self._real_httpsms_failing_with(error)

        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 0
        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("failed", code)
        wired["alert"].assert_called_once()

    @pytest.mark.asyncio
    async def test_unknown_outcome_tells_the_operator_to_check_the_message_log(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        wired["sms"].side_effect = self._real_httpsms_failing_with(httpx.ReadTimeout("timed out"))

        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 0

        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("failed", "sms_outcome_unknown")
        wired["alert"].assert_called_once()
        subject, body = _last_alert(wired)
        assert subject == "Sonu's rent text may already have been sent"
        assert "so check the message log on httpsms.com" in body
        assert "didn't go out" not in body

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
        assert await watchdog.run_watchdog(row.sent_at.replace(tzinfo=UTC) + _dt.timedelta(minutes=30)) == 0
        later = row.sent_at.replace(tzinfo=UTC) + _dt.timedelta(minutes=61)
        assert await watchdog.run_watchdog(later) == 1
        assert await watchdog.run_watchdog(later) == 0

        assert (row.status, row.error_code) == ("failed", "no_phone_confirmation")
        wired["alert"].assert_called_once()
        subject, body = _last_alert(wired)
        assert subject == "Sonu's rent text may already have been sent"
        assert "battery-optimized" in body
        assert "so check the message log on httpsms.com" in body

    @pytest.mark.asyncio
    async def test_late_confirmation_overrides_the_watchdog(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        await dispatch.run_due_reminders(SATURDAY_EVENING)
        [row] = await _sends(db)
        await watchdog.run_watchdog(row.sent_at.replace(tzinfo=UTC) + _dt.timedelta(hours=2))

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


_SEND_NOW_AT = _dt.datetime(2026, 10, 27, 15, 0, tzinfo=UTC)  # Tuesday morning


async def _send_now(applicant_id: uuid.UUID, **changes):
    """Send what the preview shows, as a client does."""
    preview = await rent_reminder_service.get_preview(
        organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=_SEND_NOW_AT,
    )
    overview = await rent_reminder_service.get_overview(
        organization_id=ORG, user_id=USER, applicant_id=applicant_id,
    )
    shown = {
        "expected_due_date": preview.due_date,
        "expected_amount": preview.amount,
        "expected_message": preview.send_now_message,
        "expected_channels": [
            channel
            for channel, enabled in (
                ("email", overview.plan.email_enabled),
                ("sms", overview.plan.sms_enabled),
            )
            if enabled
        ],
    }
    return await dispatch.send_now(
        organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=_SEND_NOW_AT,
        **{**shown, **changes},
    )

async def _text_with_unknown_outcome(db: AsyncSession, wired) -> uuid.UUID:
    """A text send-now tried, which httpSMS may have taken but never confirmed."""
    applicant_id = await _tenant(db)
    await _schedule(db, applicant_id)
    await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
    wired["sms"].side_effect = [
        SmsSendError("no answer", provider_code="outcome_unknown", outcome_unknown=True),
        "httpsms-msg-2",
    ]
    [first] = await _send_now(applicant_id)
    assert (first.status, first.error_code) == ("failed", "sms_outcome_unknown")
    return applicant_id


class TestSendNow:

    @pytest.mark.asyncio
    async def test_sends_every_enabled_channel_then_refuses_a_duplicate(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, sms_enabled=True)

        results = await _send_now(applicant_id)
        assert [(r.channel, r.status) for r in results] == [
            ("email", "sent"), ("sms", "sent_to_phone"),
        ]
        assert {r.due_date for r in results} == {_dt.date(2026, 11, 1)}
        with pytest.raises(dispatch.ReminderAlreadySentError):
            await _send_now(applicant_id)

    @pytest.mark.asyncio
    async def test_refused_once_any_channel_went_out(self, db: AsyncSession, wired) -> None:
        """Email already went; switching text on must not let send-now send it alone."""
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        plan = await _plan(db, applicant_id)
        await _send_now(applicant_id)

        plan.sms_enabled = True
        await db.flush()
        with pytest.raises(dispatch.ReminderAlreadySentError):
            await _send_now(applicant_id)
        wired["sms"].assert_not_called()

    @pytest.mark.asyncio
    async def test_says_when_rent_is_due_counting_from_today(self, db: AsyncSession, wired) -> None:
        """Sent on a Tuesday, a reminder for Sunday must not say "due tomorrow"."""
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)

        [sent] = await _send_now(applicant_id)

        row = await rent_reminder_send_repo.get(db, send_id=sent.id)
        assert row.message_body == (
            "Hi Sonu, reminder: rent of $300 is due on Sunday, Nov 1. "
            "Pay via Zelle to jason@example.com."
        )
        assert "tomorrow" not in str(wired["email"].call_args)

    @pytest.mark.parametrize(
        "change",
        [
            {"expected_due_date": _dt.date(2026, 10, 25)},
            {"expected_amount": Decimal("299.00")},
            {"expected_message": "Something else."},
            {"expected_channels": ["email", "sms"]},
        ],
    )
    @pytest.mark.asyncio
    async def test_sends_nothing_if_it_is_not_what_was_shown(
        self, db: AsyncSession, wired, change,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)

        with pytest.raises(dispatch.ReminderChangedError):
            await _send_now(applicant_id, **change)

        wired["email"].assert_not_called()
        history = await rent_reminder_service.list_history(
            organization_id=ORG, user_id=USER, applicant_id=applicant_id,
        )
        assert history == []

    @pytest.mark.asyncio
    async def test_a_retry_after_a_lost_answer_hears_it_already_went(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        await _send_now(applicant_id)

        with pytest.raises(dispatch.ReminderAlreadySentError):
            await _send_now(applicant_id, expected_message="What the phone was shown before.")
        wired["email"].assert_called_once()

    @pytest.mark.asyncio
    async def test_a_retry_hears_it_went_even_if_they_have_since_moved_out(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        await _send_now(applicant_id)
        applicant = await db.get(Applicant, applicant_id)
        applicant.tenant_ended_at = _SEND_NOW_AT
        await db.flush()

        with pytest.raises(dispatch.ReminderAlreadySentError):
            await _send_now(applicant_id)

    @pytest.mark.asyncio
    async def test_sends_nothing_if_midnight_changed_the_wording(
        self, db: AsyncSession, wired,
    ) -> None:
        """Shown late on Friday as "on Sunday", it would read "tomorrow" by Saturday."""
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        friday_night = _dt.datetime(2026, 10, 31, 4, 58, tzinfo=UTC)
        saturday = _dt.datetime(2026, 10, 31, 5, 2, tzinfo=UTC)
        preview = await rent_reminder_service.get_preview(
            organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=friday_night,
        )

        with pytest.raises(dispatch.ReminderChangedError):
            await dispatch.send_now(
                organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=saturday,
                expected_due_date=preview.due_date,
                expected_amount=preview.amount,
                expected_message=preview.send_now_message,
                expected_channels=["email"],
            )
        wired["email"].assert_not_called()

    @pytest.mark.asyncio
    async def test_a_lost_race_to_retry_sends_nothing(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        wired["email"].side_effect = [RuntimeError("smtp down"), None]
        await _send_now(applicant_id)
        wired["email"].reset_mock()

        with patch.object(
            rent_reminder_send_repo, "requeue",
            AsyncMock(side_effect=rent_reminder_send_repo.ReminderAlreadyClaimedError("x")),
        ), pytest.raises(dispatch.ReminderAlreadySentError):
            await _send_now(applicant_id)
        wired["email"].assert_not_called()

    @pytest.mark.asyncio
    async def test_a_retried_old_row_does_not_look_stuck(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        wired["email"].side_effect = RuntimeError("smtp down")
        [first] = await _send_now(applicant_id)
        row = await rent_reminder_send_repo.get(db, send_id=first.id)
        row.created_at = _dt.datetime(2026, 1, 1, tzinfo=UTC)
        await db.flush()

        await rent_reminder_send_repo.requeue(
            db, row=row, amount=row.amount, message_body=row.message_body,
            seen_attempt=row.attempt, seen_error_code=row.error_code,
        )

        stuck = await rent_reminder_send_repo.list_unconfirmed(
            db, older_than=_dt.datetime.now(UTC) - _dt.timedelta(minutes=5),
        )
        assert row.id not in [candidate.id for candidate in stuck]

    @pytest.mark.asyncio
    async def test_a_failed_alert_does_not_stop_the_other_channel(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, sms_enabled=True)
        wired["email"].side_effect = RuntimeError("smtp down")

        with patch.object(alerts, "alert_operator", AsyncMock(side_effect=RuntimeError("db"))):
            results = await _send_now(applicant_id)

        assert [(r.channel, r.status) for r in results] == [
            ("email", "failed"), ("sms", "sent_to_phone"),
        ]

    @pytest.mark.asyncio
    async def test_refuses_a_tenant_who_has_moved_out(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        applicant = await db.get(Applicant, applicant_id)
        applicant.tenant_ended_at = _SEND_NOW_AT
        await db.flush()

        with pytest.raises(dispatch.TenancyEndedError):
            await _send_now(applicant_id)
        wired["email"].assert_not_called()

    @pytest.mark.asyncio
    async def test_two_retries_of_a_failed_send_only_send_once(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        wired["email"].side_effect = [RuntimeError("smtp down"), None]
        [first] = await _send_now(applicant_id)
        row = await rent_reminder_send_repo.get(db, send_id=first.id)
        assert row.status == "failed"

        # Both retries read the row while it was still failed.
        seen = {"seen_attempt": row.attempt, "seen_error_code": row.error_code}
        await rent_reminder_send_repo.requeue(
            db, row=row, amount=row.amount, message_body=row.message_body, **seen,
        )

        with pytest.raises(rent_reminder_send_repo.ReminderAlreadyClaimedError):
            await rent_reminder_send_repo.requeue(
                db, row=row, amount=row.amount, message_body=row.message_body, **seen,
            )

    @pytest.mark.asyncio
    async def test_retries_a_failed_row(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        wired["email"].side_effect = [RuntimeError("smtp down"), None]

        [first] = await _send_now(applicant_id)
        assert first.status == "failed"
        preview = await rent_reminder_service.get_preview(
            organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=_SEND_NOW_AT,
        )
        assert preview.possibly_sent == []
        [retry] = await _send_now(applicant_id)
        assert (retry.status, retry.id) == ("sent", first.id)
        [row] = await _sends(db)
        assert row.attempt == 2

    @pytest.mark.asyncio
    async def test_a_text_that_may_have_gone_out_is_resent_only_when_confirmed(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _text_with_unknown_outcome(db, wired)
        preview = await rent_reminder_service.get_preview(
            organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=_SEND_NOW_AT,
        )
        assert (preview.sent_channels, preview.possibly_sent) == (
            [], [RentReminderPossiblySent(channel="sms", attempt=1)],
        )

        with pytest.raises(dispatch.ReminderMayHaveBeenSentError):
            await _send_now(applicant_id)
        wired["sms"].assert_called_once()

        [retry] = await _send_now(applicant_id, confirmed_possibly_sent=preview.possibly_sent)
        assert retry.status == "sent_to_phone"
        assert wired["sms"].call_count == 2
        [row] = await _sends(db)
        assert wired["sms"].call_args.kwargs["request_id"] == f"{row.id}:2"

    @pytest.mark.asyncio
    async def test_a_late_confirmation_of_an_unknown_outcome_marks_it_sent(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _text_with_unknown_outcome(db, wired)
        [row] = await _sends(db)

        assert await webhook.handle_event(
            {"type": "message.phone.delivered", "data": {"id": "httpsms-msg-9", "request_id": str(row.id)}},
            event_type_header=None,
        )
        assert (row.status, row.error_code) == ("delivered", None)
        with pytest.raises(dispatch.ReminderAlreadySentError):
            await _send_now(
                applicant_id,
                confirmed_possibly_sent=[RentReminderPossiblySent(channel="sms", attempt=1)],
            )
        wired["sms"].assert_called_once()

    @pytest.mark.asyncio
    async def test_a_phone_failure_after_an_unknown_outcome_makes_it_definite(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _text_with_unknown_outcome(db, wired)
        [row] = await _sends(db)

        assert await webhook.handle_event(
            {
                "type": "message.send.failed",
                "data": {"id": "httpsms-msg-9", "request_id": str(row.id), "error_message": "RESULT_ERROR_NO_SERVICE"},
            },
            event_type_header=None,
        )
        assert (row.status, row.error_code) == ("failed", "phone_failed: RESULT_ERROR_NO_SERVICE")
        # The operator was told it may have gone out; now they hear it didn't, once.
        assert wired["alert"].call_count == 2
        subject, body = _last_alert(wired)
        assert subject == "Sonu's rent text definitely didn't go out"
        assert "you can send it again" in body
        assert row.operator_alerted_at is not None
        assert not await webhook.handle_event(
            {"type": "message.send.failed", "data": {"request_id": str(row.id), "error_message": "AGAIN"}},
            event_type_header=None,
        )
        assert wired["alert"].call_count == 2
        preview = await rent_reminder_service.get_preview(
            organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=_SEND_NOW_AT,
        )
        assert preview.possibly_sent == []
        [retry] = await _send_now(applicant_id)
        assert retry.status == "sent_to_phone"

    @pytest.mark.asyncio
    async def test_a_definite_failure_is_never_reopened_by_the_phone(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        wired["sms"].side_effect = SmsSendError("rejected", status=422, provider_code="http_422")
        await _send_now(applicant_id)
        [row] = await _sends(db)

        assert not await webhook.handle_event(
            {"type": "message.send.failed", "data": {"request_id": str(row.id), "error_message": "X"}},
            event_type_header=None,
        )
        assert not await webhook.handle_event(
            {"type": "message.phone.sent", "data": {"request_id": str(row.id)}},
            event_type_header=None,
        )
        assert (row.status, row.error_code) == ("failed", "sms_http_422")

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
        assert preview.send_now_message == (
            "Hi Sonu, reminder: rent of $300 is due on Sunday, Nov 1. "
            "Pay via Zelle to jason@example.com."
        )
        assert preview.sent_channels == []


def _event(kind: str, row: RentReminderSend, attempt: int | None = None, **data) -> dict:
    request_id = str(row.id) if attempt is None else f"{row.id}:{attempt}"
    return {"type": kind, "data": {"request_id": request_id, **data}}


class TestWebhookTries:
    """A retry reuses the row, so the phone's news is matched to the try it's about."""


    async def _resent_after_unknown_outcome(self, db: AsyncSession, wired) -> RentReminderSend:
        """Try 1's outcome was unknown; the operator confirmed and try 2 went to the phone."""
        applicant_id = await _text_with_unknown_outcome(db, wired)
        [retry] = await _send_now(
            applicant_id,
            confirmed_possibly_sent=[RentReminderPossiblySent(channel="sms", attempt=1)],
        )
        [row] = await _sends(db)
        assert (retry.status, row.attempt, row.provider_message_id) == ("sent_to_phone", 2, "httpsms-msg-2")
        return row

    @pytest.mark.asyncio
    async def test_a_late_failure_from_the_earlier_try_is_ignored(self, db: AsyncSession, wired) -> None:
        row = await self._resent_after_unknown_outcome(db, wired)
        alerts_before = wired["alert"].call_count

        for attempt in (None, 1):
            assert not await webhook.handle_event(
                _event("message.send.failed", row, attempt, error_message="RESULT_ERROR_NO_SERVICE"),
                event_type_header=None,
            )
        assert (row.status, row.error_code) == ("sent_to_phone", None)
        assert wired["alert"].call_count == alerts_before

        assert await webhook.handle_event(
            _event("message.phone.delivered", row, 2, id="httpsms-msg-2"), event_type_header=None,
        )
        assert row.status == "delivered"

    @pytest.mark.asyncio
    async def test_a_late_confirmation_from_the_earlier_try_doesnt_confirm_the_retry(
        self, db: AsyncSession, wired,
    ) -> None:
        await _text_with_unknown_outcome(db, wired)
        [row] = await _sends(db)
        await rent_reminder_send_repo.requeue(
            db, row=row, amount=row.amount, message_body=row.message_body,
            seen_attempt=row.attempt, seen_error_code=row.error_code,
        )
        assert (row.status, row.attempt) == ("queued", 2)

        assert not await webhook.handle_event(
            _event("message.phone.delivered", row, 1, id="httpsms-msg-1"), event_type_header=None,
        )
        assert row.status == "queued"

    @pytest.mark.asyncio
    async def test_an_event_for_another_httpsms_message_is_ignored(self, db: AsyncSession, wired) -> None:
        row = await self._resent_after_unknown_outcome(db, wired)

        assert not await webhook.handle_event(
            _event("message.send.failed", row, 2, id="httpsms-msg-1", error_message="X"),
            event_type_header=None,
        )
        assert row.status == "sent_to_phone"

    @pytest.mark.asyncio
    async def test_a_stale_webhook_write_doesnt_clobber_a_requeued_row(
        self, db: AsyncSession, wired,
    ) -> None:
        await _text_with_unknown_outcome(db, wired)
        [row] = await _sends(db)
        # What a webhook read just before Send now requeued the row.
        seen = {"seen_status": row.status, "seen_error_code": row.error_code, "seen_attempt": row.attempt}
        await rent_reminder_send_repo.requeue(
            db, row=row, amount=row.amount, message_body=row.message_body,
            seen_attempt=row.attempt, seen_error_code=row.error_code,
        )

        assert not await rent_reminder_send_repo.fail_if_unchanged(
            db, row=row, error_code="phone_failed: X", **seen,
        )
        assert not await rent_reminder_send_repo.confirm_if_unchanged(
            db, row=row, status="delivered", **seen,
        )
        assert (row.status, row.error_code, row.attempt) == ("queued", None, 2)

    @pytest.mark.asyncio
    async def test_presumed_then_failed_then_delivered_stays_failed(self, db: AsyncSession, wired) -> None:
        """httpSMS never records a failed message as delivered, so neither do we."""
        await _text_with_unknown_outcome(db, wired)
        [row] = await _sends(db)

        assert await webhook.handle_event(
            _event("message.send.failed", row, error_message="RESULT_ERROR_GENERIC_FAILURE"),
            event_type_header=None,
        )
        assert not await webhook.handle_event(
            _event("message.phone.delivered", row), event_type_header=None,
        )
        assert (row.status, row.error_code) == ("failed", "phone_failed: RESULT_ERROR_GENERIC_FAILURE")

    @pytest.mark.asyncio
    async def test_a_failure_after_delivery_changes_nothing(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        await _send_now(applicant_id)
        [row] = await _sends(db)
        assert await webhook.handle_event(_event("message.phone.delivered", row, 1), event_type_header=None)

        assert not await webhook.handle_event(
            _event("message.send.failed", row, 1, error_message="X"), event_type_header=None,
        )
        assert (row.status, row.error_code) == ("delivered", None)

    async def _unconfirmed_by_phone(self, db: AsyncSession, wired) -> RentReminderSend:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        await _send_now(applicant_id)
        assert await watchdog.run_watchdog(_dt.datetime.now(UTC) + _dt.timedelta(hours=2)) == 1
        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("failed", "no_phone_confirmation")
        return row

    @pytest.mark.asyncio
    async def test_a_final_expiry_settles_an_unconfirmed_text(self, db: AsyncSession, wired) -> None:
        row = await self._unconfirmed_by_phone(db, wired)
        assert wired["alert"].call_count == 1

        assert await webhook.handle_event(
            {"type": "message.send.expired", "data": {"message_id": "httpsms-msg-1", "request_id": f"{row.id}:1", "is_final": True}},
            event_type_header=None,
        )
        assert (row.status, row.error_code) == ("failed", "expired")
        assert wired["alert"].call_count == 2
        assert wired["alert"].call_args.args[1] == "Sonu's rent text definitely didn't go out"

    @pytest.mark.asyncio
    async def test_a_non_final_expiry_leaves_an_unconfirmed_text_unsure(self, db: AsyncSession, wired) -> None:
        row = await self._unconfirmed_by_phone(db, wired)

        assert not await webhook.handle_event(
            {"type": "message.send.expired", "data": {"message_id": "httpsms-msg-1", "request_id": f"{row.id}:1", "is_final": False}},
            event_type_header=None,
        )
        assert (row.status, row.error_code) == ("failed", "no_phone_confirmation")
        assert wired["alert"].call_count == 1

    @pytest.mark.asyncio
    async def test_the_phones_error_text_is_stored_and_emailed_without_a_number(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
        await _send_now(applicant_id)
        [row] = await _sends(db)

        assert await webhook.handle_event(
            _event("message.send.failed", row, 1, error_message="cannot send to +17135550100"),
            event_type_header=None,
        )
        assert row.error_code == "phone_failed: cannot send to [phone number]"
        assert "5550100" not in _last_alert(wired)[1]


class TestSendNowConfirmation:

    @pytest.mark.asyncio
    async def test_a_confirmation_for_an_older_try_sends_nothing(self, db: AsyncSession, wired) -> None:
        applicant_id = await _text_with_unknown_outcome(db, wired)
        [row] = await _sends(db)
        row.attempt = 3
        await db.flush()

        with pytest.raises(dispatch.ReminderChangedError):
            await _send_now(
                applicant_id,
                confirmed_possibly_sent=[RentReminderPossiblySent(channel="sms", attempt=1)],
            )
        wired["sms"].assert_called_once()

    @pytest.mark.asyncio
    async def test_a_confirmation_once_nothing_is_unsure_sends_nothing(self, db: AsyncSession, wired) -> None:
        applicant_id = await _text_with_unknown_outcome(db, wired)
        [row] = await _sends(db)
        assert await webhook.handle_event(
            _event("message.send.failed", row, 1, error_message="X"), event_type_header=None,
        )

        with pytest.raises(dispatch.ReminderChangedError):
            await _send_now(
                applicant_id,
                confirmed_possibly_sent=[RentReminderPossiblySent(channel="sms", attempt=1)],
            )
        wired["sms"].assert_called_once()

    @pytest.mark.asyncio
    async def test_a_switched_off_channel_isnt_warned_about(self, db: AsyncSession, wired) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        plan = await _plan(db, applicant_id, email_enabled=True, sms_enabled=True)
        wired["sms"].side_effect = [
            SmsSendError("no answer", provider_code="outcome_unknown", outcome_unknown=True),
        ]
        wired["email"].side_effect = [RuntimeError("smtp down"), None]
        await _send_now(applicant_id)
        plan.sms_enabled = False
        await db.flush()

        preview = await rent_reminder_service.get_preview(
            organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=_SEND_NOW_AT,
        )
        assert preview.possibly_sent == []
        [retry] = await _send_now(applicant_id)
        assert (retry.channel, retry.status) == ("email", "sent")


def _phone_event(kind: str, send_id: uuid.UUID, attempt: int, **data) -> dict:
    return {"type": kind, "data": {"request_id": f"{send_id}:{attempt}", **data}}


async def _text_tenant(db: AsyncSession) -> uuid.UUID:
    applicant_id = await _tenant(db)
    await _schedule(db, applicant_id)
    await _plan(db, applicant_id, email_enabled=False, sms_enabled=True)
    return applicant_id


class TestRaces:
    """The sender, the watchdog and the phone's webhook never overwrite each other."""

    @pytest.mark.asyncio
    async def test_a_confirmation_before_an_unknown_outcome_is_recorded_stands(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _text_tenant(db)

        async def send(outbound: ReminderOutbound) -> str:
            assert await webhook.handle_event(
                _phone_event("message.phone.sent", outbound.send_id, outbound.attempt, id="httpsms-msg-1"),
                event_type_header=None,
            )
            raise SmsSendError("no answer", provider_code="outcome_unknown", outcome_unknown=True)

        with patch.object(dispatch, "_send", send):
            [result] = await _send_now(applicant_id)

        assert (result.status, result.error_code) == ("sent", None)
        wired["alert"].assert_not_called()
        preview = await rent_reminder_service.get_preview(
            organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=_SEND_NOW_AT,
        )
        assert preview.possibly_sent == []
        with pytest.raises(dispatch.ReminderAlreadySentError):
            await _send_now(applicant_id)

    @pytest.mark.asyncio
    async def test_a_confirmation_before_handing_to_the_phone_is_recorded_stands(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _text_tenant(db)

        async def send(outbound: ReminderOutbound) -> str:
            assert await webhook.handle_event(
                _phone_event("message.phone.delivered", outbound.send_id, outbound.attempt, id="httpsms-msg-1"),
                event_type_header=None,
            )
            return "httpsms-msg-1"

        with patch.object(dispatch, "_send", send):
            [result] = await _send_now(applicant_id)

        assert result.status == "delivered"
        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("delivered", None)

    @pytest.mark.asyncio
    async def test_the_watchdog_keeps_a_confirmation_that_beat_it(self, db: AsyncSession, wired) -> None:
        applicant_id = await _text_tenant(db)
        await _send_now(applicant_id)
        [row] = await _sends(db)
        real_mark_failed = rent_reminder_send_repo.mark_failed

        async def confirmed_first(db_: AsyncSession, **kwargs) -> bool:
            assert await webhook.handle_event(
                _phone_event("message.phone.sent", row.id, 1, id="httpsms-msg-1"), event_type_header=None,
            )
            return await real_mark_failed(db_, **kwargs)

        with patch.object(rent_reminder_send_repo, "mark_failed", confirmed_first):
            assert await watchdog.run_watchdog(_dt.datetime.now(UTC) + _dt.timedelta(hours=2)) == 0

        assert (row.status, row.error_code) == ("sent", None)
        wired["alert"].assert_not_called()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("outcome", ["unknown", "handed_to_phone"])
    async def test_a_stale_send_doesnt_touch_a_newer_try(
        self, db: AsyncSession, wired, outcome: str,
    ) -> None:
        await _text_with_unknown_outcome(db, wired)
        [row] = await _sends(db)
        await rent_reminder_send_repo.requeue(
            db, row=row, amount=row.amount, message_body=row.message_body,
            seen_attempt=row.attempt, seen_error_code=row.error_code,
        )
        alerts_before = wired["alert"].call_count
        wired["sms"].side_effect = (
            SmsSendError("no answer", provider_code="outcome_unknown", outcome_unknown=True)
            if outcome == "unknown"
            else None
        )
        wired["sms"].return_value = "httpsms-msg-old"

        await dispatch._deliver(
            ReminderOutbound(
                send_id=row.id, attempt=1, channel="sms", subject="", body=row.message_body,
                tenant_email=None, tenant_phone="(713) 555-0100", operator_email="jason@example.com",
            ),
        )

        assert (row.status, row.error_code, row.attempt, row.provider_message_id) == ("queued", None, 2, None)
        assert wired["alert"].call_count == alerts_before

    @pytest.mark.asyncio
    async def test_a_webhook_that_loses_a_race_decides_again(self, db: AsyncSession, wired) -> None:
        """The watchdog gives up on the text just as the phone says it went:
        the phone's news is applied to the row as it now is, not dropped."""
        applicant_id = await _text_tenant(db)
        await _send_now(applicant_id)
        [row] = await _sends(db)
        real_confirm = rent_reminder_send_repo.confirm_if_unchanged
        real_mark_failed = rent_reminder_send_repo.mark_failed
        calls: list[str] = []

        async def watchdog_first(db_: AsyncSession, **kwargs) -> bool:
            calls.append(kwargs["seen_status"])
            if len(calls) == 1:
                assert await real_mark_failed(
                    db_, row=row, error_code="no_phone_confirmation",
                    seen_status="sent_to_phone", seen_attempt=1,
                )
            return await real_confirm(db_, **kwargs)

        with patch.object(rent_reminder_send_repo, "confirm_if_unchanged", watchdog_first):
            assert await webhook.handle_event(
                _phone_event("message.phone.sent", row.id, 1, id="httpsms-msg-1"), event_type_header=None,
            )

        assert calls == ["sent_to_phone", "failed"]
        assert (row.status, row.error_code) == ("sent", None)

    @pytest.mark.asyncio
    async def test_a_webhook_gives_up_if_the_row_keeps_changing(self, db: AsyncSession, wired) -> None:
        applicant_id = await _text_tenant(db)
        await _send_now(applicant_id)
        [row] = await _sends(db)
        always_raced = AsyncMock(return_value=False)

        with patch.object(rent_reminder_send_repo, "confirm_if_unchanged", always_raced):
            assert not await webhook.handle_event(
                _phone_event("message.phone.sent", row.id, 1, id="httpsms-msg-1"), event_type_header=None,
            )

        assert always_raced.await_count == 3
        assert row.status == "sent_to_phone"


class TestOperatorAlertClaim:
    """One alert per failed try, however many callers race to send it."""

    async def _failed_text_not_yet_alerted(self, db: AsyncSession, wired) -> RentReminderSend:
        applicant_id = await _text_tenant(db)
        wired["sms"].side_effect = SmsSendError("rejected", status=422, provider_code="http_422")
        with patch.object(alerts, "alert_operator", AsyncMock(return_value=False)):
            await _send_now(applicant_id)
        [row] = await _sends(db)
        assert (row.status, row.attempt, row.operator_alerted_at) == ("failed", 1, None)
        return row

    @pytest.mark.asyncio
    async def test_two_alerts_at_once_send_one_email(self, db: AsyncSession, wired) -> None:
        row = await self._failed_text_not_yet_alerted(db, wired)
        second: list[bool] = []

        async def send_email(*args, **kwargs) -> bool:
            # Another alert for the same try arrives while this one is sending.
            second.append(await alerts.alert_operator(row.id, 1))
            return True

        wired["alert"].side_effect = send_email
        assert await alerts.alert_operator(row.id, 1)

        assert second == [False]
        wired["alert"].assert_called_once()
        assert row.operator_alerted_at is not None

    @pytest.mark.asyncio
    async def test_an_email_that_didnt_send_can_be_alerted_again(self, db: AsyncSession, wired) -> None:
        row = await self._failed_text_not_yet_alerted(db, wired)
        wired["alert"].return_value = False

        assert not await alerts.alert_operator(row.id, 1)
        assert row.operator_alerted_at is None

        wired["alert"].return_value = True
        assert await alerts.alert_operator(row.id, 1)
        assert wired["alert"].call_count == 2

    @pytest.mark.asyncio
    async def test_a_retried_try_gets_its_own_alert(self, db: AsyncSession, wired) -> None:
        row = await self._failed_text_not_yet_alerted(db, wired)
        assert await alerts.alert_operator(row.id, 1)
        await rent_reminder_send_repo.requeue(
            db, row=row, amount=row.amount, message_body=row.message_body,
            seen_attempt=1, seen_error_code=row.error_code,
        )
        assert await rent_reminder_send_repo.mark_failed(
            db, row=row, error_code="sms_http_422", seen_status="queued", seen_attempt=2,
        )

        assert not await alerts.alert_operator(row.id, 1)
        assert await alerts.alert_operator(row.id, 2)
        assert not await alerts.alert_operator(row.id, 2)
        assert wired["alert"].call_count == 2


class TestEmailThatMayHaveBeenDelivered:
    """A timeout or dropped connection while the email is being handed over can
    strike after the server took it, so it is recorded as unknown, never as a
    definite failure. One before that (connecting, STARTTLS, logging in) is
    definite: the server never had the email."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("error", "code"),
        [
            (EmailSendError("timed out", kind="transient"), "email_outcome_unknown"),
            (
                EmailSendError("connect timed out", kind="transient", failed_before_handover=True),
                "email_send_failed",
            ),
            (EmailSendError("server busy", kind="transient", smtp_code=421), "email_send_failed"),
            (EmailSendError("bad address", kind="recipient_rejected", smtp_code=550), "email_send_failed"),
            (EmailSendError("auth refused", kind="misconfigured", smtp_code=535), "email_send_failed"),
        ],
    )
    async def test_only_an_unconfirmed_delivery_is_recorded_as_unknown(
        self, db: AsyncSession, wired, error: EmailSendError, code: str,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        wired["email"].side_effect = error

        assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 0
        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("failed", code)

    @pytest.mark.asyncio
    async def test_unknown_outcome_tells_the_operator_to_ask_the_tenant(
        self, db: AsyncSession, wired, caplog: pytest.LogCaptureFixture,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        wired["email"].side_effect = EmailSendError("timed out", kind="transient")

        with caplog.at_level(logging.WARNING):
            assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 0
        assert "Rent reminder not confirmed, it may have gone out" in caplog.text
        assert "Rent reminder not sent" not in caplog.text

        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("failed", "email_outcome_unknown")
        wired["alert"].assert_called_once()
        subject, body = _last_alert(wired)
        assert subject == "Sonu's rent reminder email may already have been sent"
        assert "so ask the tenant whether it arrived before sending it again" in body
        assert "didn't go out" not in body
        assert "httpsms.com" not in body

    @pytest.mark.asyncio
    async def test_a_definite_email_failure_still_says_it_didnt_go_out(
        self, db: AsyncSession, wired, caplog: pytest.LogCaptureFixture,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        wired["email"].side_effect = EmailSendError("busy", kind="transient", smtp_code=421)

        with caplog.at_level(logging.WARNING):
            await dispatch.run_due_reminders(SATURDAY_EVENING)
        assert "Rent reminder not sent" in caplog.text
        subject, body = _last_alert(wired)
        assert subject == "Sonu's rent reminder email didn't go out"
        assert "The mail server didn't take it." in body
        assert "Reason:" not in body

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("step", "code"),
        [
            ("starttls", "email_send_failed"),
            ("login", "email_send_failed"),
            ("sendmail", "email_outcome_unknown"),
        ],
    )
    async def test_a_timeout_is_unknown_only_once_the_email_was_handed_over(
        self, db: AsyncSession, wired, step: str, code: str,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        real = EmailService(smtp_host="smtp.example.com", smtp_user="u@example.com", smtp_password="p")
        wired["email"].side_effect = real.send_or_raise_async

        with patch("smtplib.SMTP", _OfflineSmtp), \
                patch.object(_OfflineSmtp, step, side_effect=TimeoutError("timed out")):
            assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 0
        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("failed", code)

    @pytest.mark.asyncio
    async def test_a_mail_server_that_refused_the_connection_is_a_definite_failure(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        real = EmailService(smtp_host="smtp.example.com", smtp_user="u@example.com", smtp_password="p")
        wired["email"].side_effect = real.send_or_raise_async

        with patch("smtplib.SMTP", side_effect=ConnectionRefusedError("refused")):
            assert await dispatch.run_due_reminders(SATURDAY_EVENING) == 0
        [row] = await _sends(db)
        assert (row.status, row.error_code) == ("failed", "email_send_failed")

    @pytest.mark.asyncio
    async def test_send_now_resends_only_when_the_landlord_confirms(
        self, db: AsyncSession, wired,
    ) -> None:
        applicant_id = await _tenant(db)
        await _schedule(db, applicant_id)
        await _plan(db, applicant_id)
        wired["email"].side_effect = [EmailSendError("timed out", kind="transient"), None]

        [first] = await _send_now(applicant_id)
        assert (first.status, first.error_code) == ("failed", "email_outcome_unknown")
        preview = await rent_reminder_service.get_preview(
            organization_id=ORG, user_id=USER, applicant_id=applicant_id, now=_SEND_NOW_AT,
        )
        assert preview.possibly_sent == [RentReminderPossiblySent(channel="email", attempt=1)]

        with pytest.raises(dispatch.ReminderMayHaveBeenSentError) as refused:
            await _send_now(applicant_id)
        assert wired["email"].call_count == 1
        # Texts and emails share this message, so it names neither's check.
        assert "Check first, then confirm to send it again." in str(refused.value)

        [retry] = await _send_now(applicant_id, confirmed_possibly_sent=preview.possibly_sent)
        assert retry.status == "sent"
        assert wired["email"].call_count == 2


class TestAlertWording:
    """What the operator's alert says for each way a reminder can fail. Where
    to check before sending again follows the channel, never the code: only a
    text leaves a log to look at."""

    @pytest.mark.parametrize("code", ["no_phone_confirmation", "send_interrupted", "sms_outcome_unknown"])
    def test_a_text_that_may_have_gone_out_says_to_check_the_log_first(self, code: str) -> None:
        subject, body = alerts._alert_text(tenant="Sonu", channel="sms", code=code)
        assert subject == "Sonu's rent text may already have been sent"
        assert "so check the message log on httpsms.com" in body
        assert "ask the tenant" not in body

    @pytest.mark.parametrize("code", ["send_interrupted", "email_outcome_unknown"])
    def test_an_email_that_may_have_gone_out_says_to_ask_the_tenant_first(self, code: str) -> None:
        subject, body = alerts._alert_text(tenant="Sonu", channel="email", code=code)
        assert subject == "Sonu's rent reminder email may already have been sent"
        assert "so ask the tenant whether it arrived before sending it again" in body
        assert "httpsms.com" not in body

    @pytest.mark.parametrize("channel", ["sms", "email"])
    @pytest.mark.parametrize("code", sorted(REMINDER_ERROR_CODES - MAY_STILL_ARRIVE_ERRORS))
    def test_a_definite_failure_says_it_didnt_go_out(self, code: str, channel: str) -> None:
        subject, body = alerts._alert_text(tenant="Sonu", channel=channel, code=code)
        assert subject.endswith("didn't go out")
        assert "before sending it again" not in body

    @pytest.mark.parametrize("channel", ["sms", "email"])
    @pytest.mark.parametrize("code", sorted(REMINDER_ERROR_CODES))
    def test_every_known_failure_is_explained_in_words(self, code: str, channel: str) -> None:
        _subject, body = alerts._alert_text(tenant="Sonu", channel=channel, code=code)
        assert "Reason:" not in body

    def test_a_text_the_phone_never_confirmed_says_so_before_what_to_fix(self) -> None:
        _subject, body = alerts._alert_text(tenant="Sonu", channel="sms", code="no_phone_confirmation")
        said = f"The phone didn't confirm it sent the text within {SMS_CONFIRMATION_TIMEOUT_MINUTES} minutes."
        assert body.index(said) < body.index("battery-optimized")

    def test_an_expired_text_says_httpsms_gave_up_on_it(self) -> None:
        subject, body = alerts._alert_text(tenant="Sonu", channel="sms", code="expired")
        assert subject == "Sonu's rent text didn't go out"
        assert body.index("so httpSMS gave up on it.") < body.index("battery-optimized")

    def test_every_code_with_a_fixed_spelling_has_its_own_words(self) -> None:
        assert set(alerts._WHAT_HAPPENED) | {ERROR_NO_RECIPIENT} == REMINDER_ERROR_CODES
        assert set(alerts._MISSING_CONTACT) == set(RENT_REMINDER_CHANNELS)

    @pytest.mark.parametrize(
        ("channel", "code", "said"),
        [
            ("sms", "no_phone_confirmation", f"The phone didn't confirm it sent the text within {SMS_CONFIRMATION_TIMEOUT_MINUTES} minutes."),
            ("sms", "expired", "The phone didn't send the text in time, so httpSMS gave up on it."),
            ("sms", "send_interrupted", "Sending was interrupted before it was confirmed."),
            ("sms", "no_recipient", "The tenant record has no phone number."),
            ("sms", "invalid_phone", "The tenant's phone number couldn't be read. Re-enter it with the area code."),
            ("sms", "sms_not_configured", "Text reminders are switched on but httpSMS isn't configured on the server."),
            ("sms", "sms_network_error", "The server couldn't reach httpSMS, so the text wasn't sent."),
            ("sms", "sms_outcome_unknown", "httpSMS didn't confirm it took the text."),
            ("sms", "sms_http_422", "httpSMS refused the text (http_422)."),
            ("sms", "sms_send_failed", "httpSMS refused the text (send_failed)."),
            (
                "sms",
                "phone_failed: RESULT_ERROR_NO_SERVICE",
                "The phone reported a problem sending the text (RESULT_ERROR_NO_SERVICE). Check the httpSMS app on the phone.",
            ),
            ("sms", "unexpected_error", "Something went wrong sending it."),
            ("email", "send_interrupted", "Sending was interrupted before it was confirmed."),
            ("email", "no_recipient", "The tenant record has no email address."),
            ("email", "email_not_configured", "Email isn't set up on the server."),
            ("email", "email_send_failed", "The mail server didn't take it."),
            ("email", "email_outcome_unknown", "The mail server didn't confirm it took the email."),
            ("email", "unexpected_error", "Something went wrong sending it."),
        ],
    )
    def test_each_failure_says_what_happened_right_after_the_subject(
        self, channel: str, code: str, said: str,
    ) -> None:
        subject, body = alerts._alert_text(tenant="Sonu", channel=channel, code=code)
        assert body.startswith(f"{subject}. {said} ")

    def test_a_code_with_no_words_is_still_shown(self) -> None:
        _subject, body = alerts._alert_text(tenant="Sonu", channel="email", code="retired_code")
        assert "Reason: retired_code." in body

    @pytest.mark.parametrize(
        ("code", "said"),
        [
            (
                "phone_failed: RESULT_ERROR_NO_SERVICE",
                "The phone reported a problem sending the text (RESULT_ERROR_NO_SERVICE).",
            ),
            ("expired", "The phone didn't send the text in time, so httpSMS gave up on it."),
        ],
    )
    def test_a_text_that_turned_out_to_have_failed_says_why_in_words(self, code: str, said: str) -> None:
        subject, body = alerts._settled_text(tenant="Sonu", code=code)
        assert subject == "Sonu's rent text definitely didn't go out"
        assert body.startswith(f"{subject}. Earlier it looked like it might have reached them. {said}")
        assert "phone_failed" not in body
        assert body.endswith("so you can send it again with Send now on the tenant's Rent reminders card.")
