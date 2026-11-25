"""Send rent reminders: the scheduled sweep, manual "send now", and the scheduler tick.

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
operator. SMS goes out from the operator's Twilio number; the row sits at
``sent_to_provider`` until Twilio confirms through its signed status callback
(``rent_reminder_webhook_service``), or the watchdog
(``rent_reminder_watchdog_service``) fails it.

**Failures** of any kind mark the row ``failed`` with a short code
(``rent_reminder_failure_code``) and email the operator once
(``rent_reminder_alert_service``).

All data access goes through repositories; this module never imports SQLAlchemy.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import logging
import uuid
from decimal import Decimal

from platform_shared.core.audit_actor import audit_actor
from platform_shared.services.phone_number import to_e164

from app.core.datetime_utils import as_utc
from app.core.rent_reminder_channel import RentReminderChannel
from app.core.rent_reminder_request_id import format_reminder_request_id
from app.core.rent_reminder_constants import (
    ERROR_INVALID_PHONE,
    ERROR_NO_RECIPIENT,
    ERROR_SMS_NOT_ALLOWED,
    ERROR_SMS_NOT_CONFIGURED,
    ERROR_UNEXPECTED,
    MAY_STILL_ARRIVE_ERRORS,
    REMINDER_MAY_HAVE_BEEN_SENT_MESSAGE,
    SMS_OPT_OUT_SUFFIX,
)
from app.core.rent_reminder_enums import RENT_REMINDER_CHANNEL_EMAIL, RENT_REMINDER_CHANNEL_SMS
from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.rent import rent_reminder_plan_repo, rent_reminder_send_repo
from app.repositories.rent.rent_reminder_send_repo import ReminderAlreadyClaimedError
from app.schemas.rent.rent_reminder_possibly_sent import RentReminderPossiblySent
from app.schemas.rent.rent_reminder_send_response import RentReminderSendResponse
from app.services.rent import rent_reminder_alert_service as alerts
from app.services.rent import rent_reminder_math as math
from app.services.rent import rent_reminder_planner as planner
from app.services.rent import rent_reminder_send_state as send_state
from app.services.rent import rent_reminder_watchdog_service as watchdog
from app.services.rent.rent_reminder_failure_code import ReminderUndeliverable, failure_code
from app.services.rent.rent_reminder_outbound import ReminderOutbound
from app.services.rent.rent_reminder_sms_permission import may_send_texts
from app.services.rent.rent_reminder_service import (
    PlanNotFoundError,
    SMS_NOT_ALLOWED_MESSAGE,
    SMS_UNAVAILABLE_MESSAGE,
    SmsNotAllowedError,
    SmsUnavailableError,
    require_tenant,
)
from app.services.system import email_service, sms_service

logger = logging.getLogger(__name__)

_ALREADY_SENT_MESSAGE = (
    "This reminder was already sent. Email and text always go together, "
    "so nothing more is sent until the next due date."
)
_CHANGED_MESSAGE = (
    "This reminder changed since it was shown, so nothing was sent. "
    "Check the new one and send again."
)

class NoUpcomingRentError(LookupError):
    """There is no upcoming rent charge to remind about."""


class ReminderAlreadySentError(ValueError):
    """That reminder already went out (or is in flight)."""


class ReminderChangedError(ValueError):
    """The reminder is no longer what the operator was shown."""


class ReminderMayHaveBeenSentError(ValueError):
    """The last try may have reached the tenant, and resending wasn't confirmed."""


class TenancyEndedError(ValueError):
    """The tenant has moved out, so they get no more rent reminders."""


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


# --------------------------------------------------------------------------
# Delivery
# --------------------------------------------------------------------------


async def _send(outbound: ReminderOutbound) -> str | None:
    """Push one reminder out. Returns the Twilio Message SID for SMS, else ``None``."""
    if outbound.channel == RENT_REMINDER_CHANNEL_EMAIL:
        recipient = (outbound.tenant_email or "").strip()
        if not recipient:
            raise ReminderUndeliverable(ERROR_NO_RECIPIENT)
        await email_service.send_email_or_raise(
            [recipient],
            outbound.subject,
            alerts.email_html(outbound.body),
            reply_to=outbound.operator_email,
        )
        return None
    if not sms_service.is_configured():
        raise ReminderUndeliverable(ERROR_SMS_NOT_CONFIGURED)
    if not outbound.owner_may_text:
        raise ReminderUndeliverable(ERROR_SMS_NOT_ALLOWED)
    if not (outbound.tenant_phone or "").strip():
        raise ReminderUndeliverable(ERROR_NO_RECIPIENT)
    phone = to_e164(outbound.tenant_phone)
    if phone is None:
        raise ReminderUndeliverable(ERROR_INVALID_PHONE)
    return await asyncio.to_thread(
        sms_service.send_or_raise,
        phone,
        outbound.body + SMS_OPT_OUT_SUFFIX,
        request_id=format_reminder_request_id(outbound.send_id, outbound.attempt),
    )


async def _deliver(outbound: ReminderOutbound) -> RentReminderSendResponse:
    """Send a claimed row and record the outcome. Never raises on send failure."""
    provider_id: str | None = None
    error_code: str | None = None
    try:
        provider_id = await _send(outbound)
    except Exception as exc:  # noqa: BLE001 — every failure is recorded on the row + alerted
        error_code = failure_code(exc)
        if error_code == ERROR_UNEXPECTED:
            logger.exception("Rent reminder %s crashed while sending", outbound.send_id)
        elif error_code in MAY_STILL_ARRIVE_ERRORS:
            logger.warning(
                "Rent reminder not confirmed, it may have gone out: send_id=%s channel=%s code=%s",
                outbound.send_id, outbound.channel, error_code,
            )
        else:
            logger.warning(
                "Rent reminder not sent: send_id=%s channel=%s code=%s",
                outbound.send_id, outbound.channel, error_code,
            )

    async with unit_of_work() as db:
        row = await rent_reminder_send_repo.get(db, send_id=outbound.send_id)
        if row is None:  # pragma: no cover — the claim committed this row
            raise LookupError(str(outbound.send_id))
        # Each write only applies to this try while it is still queued:
        # Twilio's callback, the watchdog or a retry may have settled it first,
        # and their news is kept (no alert, no "may have been sent").
        if error_code is not None:
            recorded = await rent_reminder_send_repo.mark_failed(
                db, row=row, error_code=error_code,
                seen_status="queued", seen_attempt=outbound.attempt,
            )
        elif outbound.channel == RENT_REMINDER_CHANNEL_EMAIL:
            recorded = await rent_reminder_send_repo.mark_sent(
                db, row=row, attempt=outbound.attempt,
            )
        else:
            recorded = await rent_reminder_send_repo.mark_sent_to_provider(
                db, row=row, attempt=outbound.attempt, provider_message_id=provider_id or "",
            )
            if not recorded and provider_id:
                # Twilio's callback got there first. Its status stands, but
                # when Twilio took the text, and as which message, is ours to
                # record.
                await rent_reminder_send_repo.record_handoff(
                    db, row=row, attempt=outbound.attempt, provider_message_id=provider_id,
                )
        if not recorded:
            logger.info(
                "Rent reminder try already settled elsewhere: send_id=%s attempt=%s "
                "row_attempt=%s status=%s",
                outbound.send_id, outbound.attempt, row.attempt, row.status,
            )
        response = RentReminderSendResponse.model_validate(row)

    if error_code is not None and recorded:
        # Other channels are still waiting to go out, so a failed alert can't
        # be allowed to stop them.
        try:
            await alerts.alert_operator(outbound.send_id, outbound.attempt)
        except Exception:
            logger.exception("Couldn't alert the operator about reminder %s", outbound.send_id)
    return response


# --------------------------------------------------------------------------
# Scheduled sweep
# --------------------------------------------------------------------------


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
            plan,
            due=due,
            tenant_legal_name=applicant.legal_name,
            sender_name=await alerts.operator_name(db, plan.user_id),
            now=now,
        )
        # A row that failed BEFORE the scheduled moment came from an early
        # manual "Send now" (e.g. before the tenant's email was on file). It
        # must not swallow the scheduled send, so it gets one retry here —
        # unless it may still arrive (the provider never confirmed it either
        # way), when a retry could reach the tenant twice; the operator was
        # alerted and decides. Any other row means this reminder was already
        # attempted at its moment: a failure then is final (retrying every
        # hourly tick would spam the operator's alert), and a channel switched
        # on since must not trail behind on its own — email and text go
        # together or not at all.
        scheduled_at = math.send_at(terms, due.due_date)
        existing = await send_state.existing_rows(db, plan_id=plan.id, due_date=due.due_date)
        if any(
            not (
                row.status == "failed"
                and as_utc(row.updated_at) < scheduled_at
                and row.error_code not in MAY_STILL_ARRIVE_ERRORS
            )
            for row in existing.values()
        ):
            return 0
        pending = send_state.enabled_channels(plan)
        # What was judged safe to retry: the retry only goes ahead if the row
        # is still exactly that try (Send now may have retried it meanwhile).
        retry_rows = {
            channel: (existing[channel].id, existing[channel].attempt, existing[channel].error_code)
            for channel in pending
            if channel in existing
        }
        snapshot = {
            "plan_id": plan.id,
            "applicant_id": plan.applicant_id,
            "organization_id": plan.organization_id,
            "user_id": plan.user_id,
            "tenant_email": applicant.contact_email,
            "tenant_phone": applicant.contact_phone,
            "operator_email": await alerts.operator_email(db, plan.user_id),
            "owner_may_text": may_send_texts(plan.user_id),
        }
        if RENT_REMINDER_CHANNEL_SMS in pending and not snapshot["owner_may_text"]:
            # The text fails as ``sms_not_allowed`` below; the email still goes.
            logger.warning(
                "Rent reminder text held back: the owner may not send texts: plan_id=%s owner_id=%s",
                plan.id, plan.user_id,
            )

    sent = 0
    for channel in pending:
        try:
            async with unit_of_work() as db:
                if channel in retry_rows:
                    retry_id, seen_attempt, seen_error_code = retry_rows[channel]
                    row = await rent_reminder_send_repo.get(db, send_id=retry_id)
                    if row is None:
                        continue
                    row = await rent_reminder_send_repo.requeue(
                        db,
                        row=row,
                        seen_attempt=seen_attempt,
                        seen_error_code=seen_error_code,
                        amount=due.amount,
                        message_body=rendered.body,
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
                send_id, attempt = row.id, row.attempt
        except ReminderAlreadyClaimedError:
            continue
        result = await _deliver(
            ReminderOutbound(
                send_id=send_id,
                attempt=attempt,
                channel=channel,
                subject=rendered.subject,
                body=rendered.body,
                tenant_email=snapshot["tenant_email"],
                tenant_phone=snapshot["tenant_phone"],
                operator_email=snapshot["operator_email"],
                owner_may_text=snapshot["owner_may_text"],
            ),
        )
        if result.status != "failed":
            sent += 1
    return sent


async def run_due_reminders(now: _dt.datetime | None = None) -> int:
    """Send every reminder whose moment has come. Returns how many went out.

    One bad plan never stops the sweep: each is processed in isolation and
    any error is logged and skipped. Each plan's writes are audited as the
    plan's owner, the person whose account deletion takes the plan with it.
    """
    moment = now or _now()
    async with unit_of_work() as db:
        plans = [(p.id, p.user_id) for p in await rent_reminder_plan_repo.list_active(db)]
    sent = 0
    for plan_id, owner_id in plans:
        try:
            with audit_actor(owner_id):
                sent += await _process_plan(plan_id, moment)
        except Exception:  # noqa: BLE001 — isolate plans from each other
            logger.exception("Rent reminder sweep failed for plan %s", plan_id)
    return sent


async def run_tick(now: _dt.datetime | None = None) -> None:
    """One scheduler pass: send what is due, then sweep for lost sends."""
    moment = now or _now()
    try:
        await run_due_reminders(moment)
    except Exception:  # noqa: BLE001 — keep the worker loop alive
        logger.exception("Rent reminder sweep crashed")
    try:
        await watchdog.run_watchdog(moment)
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
    expected_due_date: _dt.date,
    expected_amount: Decimal,
    expected_message: str,
    expected_channels: list[RentReminderChannel],
    confirmed_possibly_sent: list[RentReminderPossiblySent] | None = None,
    now: _dt.datetime | None = None,
) -> list[RentReminderSendResponse]:
    """Send the next reminder right away on every enabled channel, together.

    Ignores the send time and daytime window — the operator asked for it.
    Channels that failed before are retried alongside the rest. Once the
    reminder went out (or is in flight) on any channel it is refused: a
    second channel never follows later on its own.

    A message can't be recalled, so what goes out must be what the operator
    saw. If the date rolled over or the plan or rent changed since, nothing is
    sent. An already-sent reminder is refused first, so retrying after a lost
    response reports what really happened. A failed try that may still have
    reached the tenant is resent only when ``confirmed_possibly_sent`` names
    exactly those tries, as the operator was shown them; if the tries have
    moved on since, nothing is sent.
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
        channels = send_state.enabled_channels(plan)
        today = math.local_now(planner.plan_terms(plan), moment).date()
        due = await planner.next_due_for_plan(db, plan=plan, from_date=today)
        if due is None:
            raise NoUpcomingRentError("There is no upcoming rent to remind about.")
        existing = await send_state.existing_rows(db, plan_id=plan.id, due_date=due.due_date)
        if any(row.status != "failed" for row in existing.values()):
            raise ReminderAlreadySentError(_ALREADY_SENT_MESSAGE)
        possibly_sent = send_state.possibly_sent(existing, channels)
        confirmed = confirmed_possibly_sent or []
        if possibly_sent and not confirmed:
            raise ReminderMayHaveBeenSentError(REMINDER_MAY_HAVE_BEEN_SENT_MESSAGE)
        if confirmed and set(confirmed) != set(possibly_sent):
            raise ReminderChangedError(_CHANGED_MESSAGE)
        if applicant.tenant_ended_at is not None:
            raise TenancyEndedError("This tenancy has ended, so reminders don't go out.")
        if RENT_REMINDER_CHANNEL_SMS in channels and not sms_service.is_configured():
            raise SmsUnavailableError(SMS_UNAVAILABLE_MESSAGE)
        owner_may_text = may_send_texts(plan.user_id)
        if RENT_REMINDER_CHANNEL_SMS in channels and not owner_may_text:
            logger.warning(
                "Send now refused: texts on but the owner may not send them: plan_id=%s owner_id=%s",
                plan.id, plan.user_id,
            )
            raise SmsNotAllowedError(SMS_NOT_ALLOWED_MESSAGE)
        rendered = planner.render_for_send_now(
            plan,
            due=due,
            tenant_legal_name=applicant.legal_name,
            sender_name=await alerts.operator_name(db, plan.user_id),
            now=moment,
        )
        if (
            due.due_date != expected_due_date
            or due.amount != expected_amount
            or rendered.body != expected_message
            or set(channels) != set(expected_channels)
        ):
            raise ReminderChangedError(_CHANGED_MESSAGE)
        operator_email = await alerts.operator_email(db, user_id)
        outbounds: list[ReminderOutbound] = []
        for channel in channels:
            if channel in existing:
                try:
                    row = await rent_reminder_send_repo.requeue(
                        db,
                        row=existing[channel],
                        seen_attempt=existing[channel].attempt,
                        seen_error_code=existing[channel].error_code,
                        amount=due.amount,
                        message_body=rendered.body,
                    )
                except ReminderAlreadyClaimedError as exc:
                    raise ReminderAlreadySentError(_ALREADY_SENT_MESSAGE) from exc
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
                ReminderOutbound(
                    send_id=row.id,
                    attempt=row.attempt,
                    channel=channel,
                    subject=rendered.subject,
                    body=rendered.body,
                    tenant_email=applicant.contact_email,
                    tenant_phone=applicant.contact_phone,
                    operator_email=operator_email,
                    owner_may_text=owner_may_text,
                ),
            )
    return [await _deliver(outbound) for outbound in outbounds]
