"""Rent-reminder plans: settings, preview and history for one tenant.

Sending lives in ``rent_reminder_dispatch_service``. All data access goes
through repositories; this module never imports SQLAlchemy.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.rent_reminder_enums import RENT_REMINDER_CHANNELS
from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.rent import rent_reminder_plan_repo, rent_reminder_send_repo
from app.schemas.rent.rent_reminder_overview_response import RentReminderOverviewResponse
from app.schemas.rent.rent_reminder_plan_request import RentReminderPlanRequest
from app.schemas.rent.rent_reminder_plan_response import RentReminderPlanResponse
from app.schemas.rent.rent_reminder_preview_response import RentReminderPreviewResponse
from app.schemas.rent.rent_reminder_send_response import RentReminderSendResponse
from app.schemas.rent.rent_reminder_sms_status import RentReminderSmsStatus
from app.services.rent import rent_reminder_math as math
from app.services.rent import rent_reminder_planner as planner
from app.services.system import sms_service

_HISTORY_LIMIT = 50


class TenantNotFoundError(LookupError):
    """No applicant with that id in this organization."""


class PlanNotFoundError(LookupError):
    """The tenant has no reminder plan."""


class PlanAlreadyExistsError(ValueError):
    """The tenant already has a reminder plan; update it instead."""


class SmsUnavailableError(ValueError):
    """Text reminders were requested but SMS is not configured here."""


SMS_UNAVAILABLE_MESSAGE = (
    "Text reminders are not set up on this server yet. Use email for now."
)


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def sms_status() -> RentReminderSmsStatus:
    return RentReminderSmsStatus(
        available=sms_service.is_configured(),
        from_number=sms_service.from_number(),
        encrypted=sms_service.encrypts_messages(),
        webhook_url=sms_service.webhook_url(),
    )


async def require_tenant(db, *, organization_id, user_id, applicant_id):
    applicant = await applicant_repo.get(
        db, applicant_id=applicant_id, organization_id=organization_id, user_id=user_id,
    )
    if applicant is None:
        raise TenantNotFoundError(str(applicant_id))
    return applicant


def _fields(payload: RentReminderPlanRequest) -> dict[str, object]:
    if payload.sms_enabled and not sms_service.is_configured():
        raise SmsUnavailableError(SMS_UNAVAILABLE_MESSAGE)
    return payload.model_dump()


async def get_overview(
    *, organization_id: uuid.UUID, user_id: uuid.UUID, applicant_id: uuid.UUID,
) -> RentReminderOverviewResponse:
    async with unit_of_work() as db:
        applicant = await require_tenant(
            db, organization_id=organization_id, user_id=user_id, applicant_id=applicant_id,
        )
        plan = await rent_reminder_plan_repo.get_for_applicant(
            db, organization_id=organization_id, applicant_id=applicant_id,
        )
        return RentReminderOverviewResponse(
            plan=RentReminderPlanResponse.model_validate(plan) if plan else None,
            sms=sms_status(),
            tenant_has_email=bool((applicant.contact_email or "").strip()),
            tenant_has_phone=bool((applicant.contact_phone or "").strip()),
        )


async def create_plan(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    payload: RentReminderPlanRequest,
) -> RentReminderPlanResponse:
    fields = _fields(payload)
    async with unit_of_work() as db:
        await require_tenant(
            db, organization_id=organization_id, user_id=user_id, applicant_id=applicant_id,
        )
        if await rent_reminder_plan_repo.get_for_applicant(
            db, organization_id=organization_id, applicant_id=applicant_id,
        ):
            raise PlanAlreadyExistsError("This tenant already has a reminder plan.")
        plan = await rent_reminder_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            applicant_id=applicant_id,
            fields=fields,
        )
        return RentReminderPlanResponse.model_validate(plan)


async def update_plan(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    payload: RentReminderPlanRequest,
) -> RentReminderPlanResponse:
    fields = _fields(payload)
    async with unit_of_work() as db:
        await require_tenant(
            db, organization_id=organization_id, user_id=user_id, applicant_id=applicant_id,
        )
        plan = await rent_reminder_plan_repo.get_for_applicant(
            db, organization_id=organization_id, applicant_id=applicant_id,
        )
        if plan is None:
            raise PlanNotFoundError(str(applicant_id))
        plan = await rent_reminder_plan_repo.update(db, plan=plan, fields=fields)
        return RentReminderPlanResponse.model_validate(plan)


async def delete_plan(
    *, organization_id: uuid.UUID, user_id: uuid.UUID, applicant_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        await require_tenant(
            db, organization_id=organization_id, user_id=user_id, applicant_id=applicant_id,
        )
        plan = await rent_reminder_plan_repo.get_for_applicant(
            db, organization_id=organization_id, applicant_id=applicant_id,
        )
        if plan is None:
            raise PlanNotFoundError(str(applicant_id))
        await rent_reminder_plan_repo.soft_delete(db, plan=plan)


async def get_preview(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    now: _dt.datetime | None = None,
) -> RentReminderPreviewResponse | None:
    """The next reminder this plan will send, or ``None`` with no upcoming rent."""
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
        today = math.local_now(planner.plan_terms(plan), moment).date()
        due = await planner.next_due_for_plan(db, plan=plan, from_date=today)
        if due is None:
            return None
        sent_channels: list[str] = []
        for channel in RENT_REMINDER_CHANNELS:
            row = await rent_reminder_send_repo.get_by_key(
                db, plan_id=plan.id, due_date=due.due_date, channel=channel,
            )
            # A failed send stays retryable, so it does not count as sent.
            if row is not None and row.status != "failed":
                sent_channels.append(channel)
        rendered = planner.render(
            plan, due=due, tenant_legal_name=applicant.legal_name, now=moment,
        )
        return RentReminderPreviewResponse(
            due_date=due.due_date,
            send_at=rendered.send_at,
            amount=due.amount,
            period_start=due.period.period_start,
            period_end=due.period.period_end,
            message=rendered.body,
            sent_channels=sent_channels,
        )


async def list_history(
    *, organization_id: uuid.UUID, user_id: uuid.UUID, applicant_id: uuid.UUID,
) -> list[RentReminderSendResponse]:
    async with unit_of_work() as db:
        await require_tenant(
            db, organization_id=organization_id, user_id=user_id, applicant_id=applicant_id,
        )
        rows = await rent_reminder_send_repo.list_for_applicant(
            db, organization_id=organization_id, applicant_id=applicant_id,
            limit=_HISTORY_LIMIT,
        )
        return [RentReminderSendResponse.model_validate(r) for r in rows]
