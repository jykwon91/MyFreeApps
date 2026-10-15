"""Send rent reminders: the scheduled sweep, manual "send now", and the watchdog.

**Idempotency.** Every send is first *claimed* as a ``queued`` row keyed by
(plan, due date, channel), in its own committed transaction, before anything
leaves the building. A second tick, a restarted worker, or a race with "send
now" finds the row (or trips the unique constraint) and sends nothing. The
cost is that a crash between claim and delivery leaves a ``queued`` row with
nothing sent — the watchdog fails it (``send_interrupted``) and tells the
operator, rather than risking a double text.

**Channels go together.** Email and text for one due date are sent in the
same pass or not at all. A channel switched on after the reminder already
went out on the other one waits for the next due date instead of trailing
behind on its own, and "send now" sends every enabled channel at once.

**Delivery.** Email goes straight to the tenant with ``Reply-To`` set to the
operator. SMS is handed to the operator's Android phone via httpSMS; the row
sits at ``sent_to_phone`` until the phone confirms through the signed webhook
(``rent_reminder_webhook_service``), or the watchdog fails it.

**Failures** of any kind mark the row ``failed`` with a short code and email
the operator once (``rent_reminder_alert_service``).

All data access goes through repositories; this module never imports SQLAlchemy.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import logging
import uuid
from dataclasses import dataclass

from platform_shared.services.email_service import EmailNotConfiguredError, EmailSendError
from platform_shared.services.phone_number import to_e164
from platform_shared.services.sms_service import SmsNotConfiguredError, SmsSendError

from app.core.rent_reminder_constants import (
    ERROR_INVALID_PHONE,
    ERROR_NO_PHONE_CONFIRMATION,
    ERROR_NO_RECIPIENT,
    ERROR_SEND_INTERRUPTED,
    ERROR_SMS_NOT_CONFIGURED,
    SMS_CONFIRMATION_TIMEOUT_MINUTES,
)
from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.rent import rent_reminder_plan_repo, rent_reminder_send_repo
from app.repositories.rent.rent_reminder_send_repo import ReminderAlreadyClaimedError
from app.schemas.rent.rent_reminder_send_response import RentReminderSendResponse
from app.services.rent import rent_reminder_alert_service as alerts
from app.services.rent import rent_reminder_math as math
from app.services.rent import rent_reminder_planner as planner
from app.services.rent.rent_reminder_service import (
    PlanNotFoundError,
    SMS_UNAVAILABLE_MESSAGE,
    SmsUnavailableError,
    require_tenant,
)
from app.services.system import email_service, sms_service

logger = logging.getLogger(__name__)

_EMAIL = "email"
_SMS = "sms"
_ALL_CHANNELS = (_EMAIL, _SMS)
_ALREADY_SENT_MESSAGE = (
    "This reminder already went out. Email and text always go together, "
    "so nothing more is sent until the next due date."
)
_ERROR_EMAIL_NOT_CONFIGURED = "email_not_configured"
_ERROR_EMAIL_SEND_FAILED = "email_send_failed"

class NoUpcomingRentError(LookupError):
    """There is no upcoming rent charge to remind about."""


class ReminderAlreadySentError(ValueError):
    """That reminder already went out (or is in flight)."""


class _Undeliverable(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class _Outbound:
    """Everything delivery needs, snapshotted so no session stays open."""

    send_id: uuid.UUID
    channel: str
    subject: str
    body: str
    tenant_email: str | None
    tenant_phone: str | None
    operator_email: str | None


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def _enabled_channels(plan) -> list[str]:
    channels: list[str] = []
    if plan.email_enabled:
        channels.append(_EMAIL)
    if plan.sms_enabled:
        channels.append(_SMS)
    return channels


async def _existing_rows(db, *, plan_id: uuid.UUID, due_date: _dt.date) -> dict:
    """Send rows already recorded for this due date, keyed by channel."""
    rows = {}
    for channel in _ALL_CHANNELS:
        row = await rent_reminder_send_repo.get_by_key(
            db, plan_id=plan_id, due_date=due_date, channel=channel,
        )
        if row is not None:
            rows[channel] = row
    return rows


# --------------------------------------------------------------------------
# Delivery
# --------------------------------------------------------------------------


async def _send(outbound: _Outbound) -> str | None:
    """Push one reminder out. Returns the httpSMS id for SMS, else ``None``."""
    if outbound.channel == _EMAIL:
        recipient = (outbound.tenant_email or "").strip()
        if not recipient:
            raise _Undeliverable(ERROR_NO_RECIPIENT)
        await asyncio.to_thread(
            email_service.send_email_or_raise,
            [recipient],
            outbound.subject,
            alerts.email_html(outbound.body),
            reply_to=outbound.operator_email,
        )
        return None
    if not sms_service.is_configured():
        raise _Undeliverable(ERROR_SMS_NOT_CONFIGURED)
    if not (outbound.tenant_phone or "").strip():
        raise _Undeliverable(ERROR_NO_RECIPIENT)
    phone = to_e164(outbound.tenant_phone)
    if phone is None:
        raise _Undeliverable(ERROR_INVALID_PHONE)
    return await asyncio.to_thread(
        sms_service.send_or_raise, phone, outbound.body, request_id=str(outbound.send_id),
    )


def _failure_code(exc: Exception) -> str:
    if isinstance(exc, _Undeliverable):
        return exc.code
    if isinstance(exc, SmsSendError):
        return f"sms_{exc.provider_code or 'send_failed'}"
    if isinstance(exc, SmsNotConfiguredError):
        return ERROR_SMS_NOT_CONFIGURED
    if isinstance(exc, EmailNotConfiguredError):
        return _ERROR_EMAIL_NOT_CONFIGURED
    if isinstance(exc, EmailSendError):
        return _ERROR_EMAIL_SEND_FAILED
    return alerts.ERROR_UNEXPECTED


async def _deliver(outbound: _Outbound) -> RentReminderSendResponse:
    """Send a claimed row and record the outcome. Never raises on send failure."""
    provider_id: str | None = None
    error_code: str | None = None
    try:
        provider_id = await _send(outbound)
    except Exception as exc:  # noqa: BLE001 — every failure is recorded on the row + alerted
        error_code = _failure_code(exc)
        if error_code == alerts.ERROR_UNEXPECTED:
            logger.exception("Rent reminder %s crashed while sending", outbound.send_id)
        else:
            logger.warning(
                "Rent reminder not sent: send_id=%s channel=%s code=%s",
                outbound.send_id, outbound.channel, error_code,
            )

    async with unit_of_work() as db:
        row = await rent_reminder_send_repo.get(db, send_id=outbound.send_id)
        if row is None:  # pragma: no cover — the claim committed this row
            raise LookupError(str(outbound.send_id))
        if error_code is not None:
            await rent_reminder_send_repo.mark_failed(db, row=row, error_code=error_code)
        elif outbound.channel == _EMAIL:
            await rent_reminder_send_repo.mark_sent(db, row=row)
        elif row.status == "queued":
            # The phone's webhook can beat us here; never step a confirmed
            # row back to ``sent_to_phone``.
            await rent_reminder_send_repo.mark_sent_to_phone(
                db, row=row, provider_message_id=provider_id or "",
            )
        response = RentReminderSendResponse.model_validate(row)

    if error_code is not None:
        await alerts.alert_operator(outbound.send_id)
    return response


# --------------------------------------------------------------------------
# Operator alerts
# --------------------------------------------------------------------------


# --------------------------------------------------------------------------
# Scheduled sweep
# --------------------------------------------------------------------------


def _as_utc(moment: _dt.datetime) -> _dt.datetime:
    """Timestamps are stored UTC; some drivers hand them back naive."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=_dt.timezone.utc)
    return moment


async def _process_plan(plan_id: uuid.UUID, now: _dt.datetime) -> int:
    async with unit_of_work() as db:
        plan = await rent_reminder_plan_repo.get_by_id(db, plan_id=plan_id)
        if plan is None or not plan.is_active:
            return 0
        applicant = await applicant_repo.get(
            db,
            applicant_id=plan.applicant_id,
            organization_id=plan.organization_id,
            user_id=plan.user_id,
        )
        if applicant is None or applicant.tenant_ended_at is not None:
            return 0
        terms = planner.plan_terms(plan)
        today = math.local_now(terms, now).date()
        due = await planner.next_due_for_plan(db, plan=plan, from_date=today)
        if due is None or not math.is_due_to_send(terms, due.due_date, now):
            return 0
        rendered = planner.render(
            plan, due=due, tenant_legal_name=applicant.legal_name, now=now,
        )
        # A row that failed BEFORE the scheduled moment came from an early
        # manual "Send now" (e.g. before the tenant's email was on file). It
        # must not swallow the scheduled send, so it gets one retry here. Any
        # other row means this reminder was already attempted at its moment:
        # a failure then is final (retrying every hourly tick would spam the
        # operator's alert), and a channel switched on since must not trail
        # behind on its own — email and text go together or not at all.
        scheduled_at = math.send_at(terms, due.due_date)
        existing = await _existing_rows(db, plan_id=plan.id, due_date=due.due_date)
        if any(
            not (row.status == "failed" and _as_utc(row.updated_at) < scheduled_at)
            for row in existing.values()
        ):
            return 0
        pending = _enabled_channels(plan)
        retry_rows = {
            channel: existing[channel].id for channel in pending if channel in existing
        }
        snapshot = {
            "plan_id": plan.id,
            "applicant_id": plan.applicant_id,
            "organization_id": plan.organization_id,
            "user_id": plan.user_id,
            "tenant_email": applicant.contact_email,
            "tenant_phone": applicant.contact_phone,
            "operator_email": await alerts.operator_email(db, plan.user_id),
        }

    sent = 0
    for channel in pending:
        try:
            async with unit_of_work() as db:
                if channel in retry_rows:
                    row = await rent_reminder_send_repo.get(db, send_id=retry_rows[channel])
                    if row is None or row.status != "failed":
                        continue
                    row = await rent_reminder_send_repo.requeue(
                        db, row=row, amount=due.amount, message_body=rendered.body,
                    )
                else:
                    row = await rent_reminder_send_repo.claim(
                        db,
                        plan_id=snapshot["plan_id"],
                        applicant_id=snapshot["applicant_id"],
                        organization_id=snapshot["organization_id"],
                        user_id=snapshot["user_id"],
                        due_date=due.due_date,
                        channel=channel,
                        amount=due.amount,
                        message_body=rendered.body,
                    )
                send_id = row.id
        except ReminderAlreadyClaimedError:
            continue
        result = await _deliver(
            _Outbound(
                send_id=send_id,
                channel=channel,
                subject=rendered.subject,
                body=rendered.body,
                tenant_email=snapshot["tenant_email"],
                tenant_phone=snapshot["tenant_phone"],
                operator_email=snapshot["operator_email"],
            ),
        )
        if result.status != "failed":
            sent += 1
    return sent


async def run_due_reminders(now: _dt.datetime | None = None) -> int:
    """Send every reminder whose moment has come. Returns how many went out.

    One bad plan never stops the sweep: each is processed in isolation and
    any error is logged and skipped.
    """
    moment = now or _now()
    async with unit_of_work() as db:
        plan_ids = [p.id for p in await rent_reminder_plan_repo.list_active(db)]
    sent = 0
    for plan_id in plan_ids:
        try:
            sent += await _process_plan(plan_id, moment)
        except Exception:  # noqa: BLE001 — isolate plans from each other
            logger.exception("Rent reminder sweep failed for plan %s", plan_id)
    return sent


async def run_watchdog(now: _dt.datetime | None = None) -> int:
    """Fail reminders that never got an outcome, and tell the operator.

    ``sent_to_phone`` with no phone confirmation in time means the phone is
    off, offline, or asleep (``no_phone_confirmation``); a ``queued`` row that
    old means the worker died mid-send (``send_interrupted``).
    """
    moment = now or _now()
    cutoff = moment - _dt.timedelta(minutes=SMS_CONFIRMATION_TIMEOUT_MINUTES)
    failed: list[uuid.UUID] = []
    async with unit_of_work() as db:
        for row in await rent_reminder_send_repo.list_unconfirmed(db, older_than=cutoff):
            code = (
                ERROR_NO_PHONE_CONFIRMATION
                if row.status == "sent_to_phone"
                else ERROR_SEND_INTERRUPTED
            )
            logger.warning(
                "Rent reminder unconfirmed: send_id=%s channel=%s status=%s code=%s",
                row.id, row.channel, row.status, code,
            )
            await rent_reminder_send_repo.mark_failed(db, row=row, error_code=code)
            failed.append(row.id)
    for send_id in failed:
        try:
            await alerts.alert_operator(send_id)
        except Exception:  # noqa: BLE001 — one alert failing must not stop the rest
            logger.exception("Could not alert the operator about reminder %s", send_id)
    return len(failed)


async def run_tick(now: _dt.datetime | None = None) -> None:
    """One scheduler pass: send what is due, then sweep for lost sends."""
    moment = now or _now()
    try:
        await run_due_reminders(moment)
    except Exception:  # noqa: BLE001 — keep the worker loop alive
        logger.exception("Rent reminder sweep crashed")
    try:
        await run_watchdog(moment)
    except Exception:  # noqa: BLE001 — keep the worker loop alive
        logger.exception("Rent reminder watchdog crashed")


# --------------------------------------------------------------------------
# Send now
# --------------------------------------------------------------------------


async def send_now(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    now: _dt.datetime | None = None,
) -> list[RentReminderSendResponse]:
    """Send the next reminder right away on every enabled channel, together.

    Ignores the send time and daytime window — the operator asked for it.
    Channels that failed before are retried alongside the rest. Once the
    reminder went out (or is in flight) on any channel it is refused: a
    second channel never follows later on its own.
    """
    moment = now or _now()
    async with unit_of_work() as db:
        applicant = await require_tenant(
            db, organization_id=organization_id, user_id=user_id, applicant_id=applicant_id,
        )
        plan = await rent_reminder_plan_repo.get_for_applicant(
            db, organization_id=organization_id, applicant_id=applicant_id,
        )
        if plan is None:
            raise PlanNotFoundError(str(applicant_id))
        channels = _enabled_channels(plan)
        if _SMS in channels and not sms_service.is_configured():
            raise SmsUnavailableError(SMS_UNAVAILABLE_MESSAGE)
        today = math.local_now(planner.plan_terms(plan), moment).date()
        due = await planner.next_due_for_plan(db, plan=plan, from_date=today)
        if due is None:
            raise NoUpcomingRentError("There is no upcoming rent to remind about.")
        rendered = planner.render(
            plan, due=due, tenant_legal_name=applicant.legal_name, now=moment,
        )
        existing = await _existing_rows(db, plan_id=plan.id, due_date=due.due_date)
        if any(row.status != "failed" for row in existing.values()):
            raise ReminderAlreadySentError(_ALREADY_SENT_MESSAGE)
        operator_email = await alerts.operator_email(db, user_id)
        outbounds: list[_Outbound] = []
        for channel in channels:
            if channel in existing:
                row = await rent_reminder_send_repo.requeue(
                    db, row=existing[channel], amount=due.amount, message_body=rendered.body,
                )
            else:
                try:
                    row = await rent_reminder_send_repo.claim(
                        db,
                        plan_id=plan.id,
                        applicant_id=plan.applicant_id,
                        organization_id=plan.organization_id,
                        user_id=plan.user_id,
                        due_date=due.due_date,
                        channel=channel,
                        amount=due.amount,
                        message_body=rendered.body,
                    )
                except ReminderAlreadyClaimedError as exc:
                    raise ReminderAlreadySentError(_ALREADY_SENT_MESSAGE) from exc
            outbounds.append(
                _Outbound(
                    send_id=row.id,
                    channel=channel,
                    subject=rendered.subject,
                    body=rendered.body,
                    tenant_email=applicant.contact_email,
                    tenant_phone=applicant.contact_phone,
                    operator_email=operator_email,
                ),
            )
    return [await _deliver(outbound) for outbound in outbounds]
