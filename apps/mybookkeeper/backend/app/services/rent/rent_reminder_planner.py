"""Load what the pure reminder math needs for one plan.

Shared by the plan service (preview), the dispatcher (scheduled and manual
sends) so both quote the same due date and amount. Reads go through
repositories; nothing here writes.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from dataclasses import dataclass

from app.repositories.rent import rent_charge_repo, rent_schedule_repo
from app.services.rent import rent_reminder_math as math
from app.services.rent import rent_reminder_message as message

_RENT_CHARGE_TYPE = "rent"


@dataclass(frozen=True)
class RenderedReminder:
    due: math.DueReminder
    send_at: _dt.datetime
    body: str
    subject: str


def plan_terms(plan) -> math.PlanTerms:
    return math.PlanTerms(
        frequency=plan.frequency,
        due_weekday=plan.due_weekday,
        send_days_before=plan.send_days_before,
        send_time=plan.send_time,
        timezone=plan.timezone,
        amount_override=plan.amount_override,
    )


async def next_due_for_plan(db, *, plan, from_date: _dt.date) -> math.DueReminder | None:
    schedules = await rent_schedule_repo.list_for_applicant(
        db, organization_id=plan.organization_id, applicant_id=plan.applicant_id,
    )
    charges = await rent_charge_repo.list_for_applicant(
        db, organization_id=plan.organization_id, applicant_id=plan.applicant_id,
    )
    skipped: frozenset[tuple[uuid.UUID, _dt.date]] = frozenset(
        (c.schedule_id, c.period_start)
        for c in charges
        if c.charge_type == _RENT_CHARGE_TYPE
        and c.schedule_id is not None
        and c.waived_at is not None
    )
    return math.next_due(
        plan_terms(plan),
        [
            math.ScheduleTerms(
                id=s.id,
                amount=s.amount,
                cadence=s.cadence,
                start_date=s.start_date,
                end_date=s.end_date,
            )
            for s in schedules
        ],
        from_date=from_date,
        skipped_periods=skipped,
    )


def render(
    plan, *, due: math.DueReminder, tenant_legal_name: str | None, now: _dt.datetime,
) -> RenderedReminder:
    """The reminder text as it will read on the day it goes out.

    Rendered relative to the later of "today" and the scheduled send day, so a
    preview of next week's reminder already reads "due tomorrow (Sunday)".
    """
    terms = plan_terms(plan)
    scheduled = math.send_at(terms, due.due_date)
    sent_on = max(math.local_now(terms, now).date(), scheduled.date())
    return RenderedReminder(
        due=due,
        send_at=scheduled,
        body=message.render_reminder(
            tenant_legal_name=tenant_legal_name,
            amount=due.amount,
            due_date=due.due_date,
            sent_on=sent_on,
            payment_instructions=plan.payment_instructions,
        ),
        subject=message.reminder_subject(due.amount, due.due_date),
    )
