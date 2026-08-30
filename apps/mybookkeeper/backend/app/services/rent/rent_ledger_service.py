"""Service layer for the tenant rent ledger.

Two responsibilities:

1. **Materializing charges.** Periods that have begun are turned into
   ``rent_charges`` rows on demand, when the ledger is read or a schedule is
   written. Generation is idempotent (it skips period starts that already
   exist), so there is no worker to run, nothing to backfill after downtime,
   and no drift between a schedule and its charges.

2. **Assembling the ledger.** Charges and attributed payments are handed to the
   pure FIFO allocator and the result is shaped into the response.

All data access goes through repositories; this module never imports SQLAlchemy.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from decimal import Decimal

from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.rent import rent_charge_repo, rent_schedule_repo
from app.schemas.rent.rent_charge_response import RentChargeResponse
from app.schemas.rent.rent_ledger_response import RentLedgerResponse
from app.schemas.rent.rent_payment_application import RentPaymentApplication
from app.schemas.rent.rent_payment_response import RentPaymentResponse
from app.schemas.rent.rent_period_summary import RentPeriodSummary
from app.schemas.rent.rent_schedule_response import RentScheduleResponse
from app.services.rent import rent_period_math as period_math
from app.services.rent.rent_allocation import (
    ChargeInput,
    PaymentInput,
    allocate,
)

logger = logging.getLogger(__name__)

_ZERO = Decimal("0.00")


class TenantNotFoundError(LookupError):
    """No applicant with that id in this organization."""


def _today() -> _dt.date:
    return _dt.datetime.now(_dt.timezone.utc).date()


def _period_label(start: _dt.date, end: _dt.date, cadence: str | None) -> str:
    """Human label for a period.

    Monthly periods aligned to a calendar month read as "August 2026"; anything
    else reads as a date range, because "August 2026" would be actively
    misleading for a period running Aug 15 to Sep 14.
    """
    if (
        cadence == "monthly"
        and start.day == 1
        and end.month == start.month
        and end.year == start.year
    ):
        return start.strftime("%B %Y")
    # ``%-d`` is a glibc extension that raises on Windows, so day numbers are
    # stripped of their leading zero by hand.
    def day(d: _dt.date) -> str:
        return f"{d.strftime('%b')} {d.day}"

    if start.year == end.year:
        return f"{day(start)} – {day(end)}, {end.year}"
    return f"{day(start)}, {start.year} – {day(end)}, {end.year}"


async def _generate_charges_for_schedule(
    db, *, schedule, through: _dt.date,
) -> int:
    """Reconcile one schedule's charges with what the schedule now implies.

    Three things happen, and all three matter:

    - **Insert** a charge for any begun period that has none.
    - **Re-truncate** an existing charge whose period or amount no longer
      matches the schedule. Setting an ``end_date`` part-way through a month
      has to shorten the charge already written for that month; skipping
      existing periods (the obvious implementation) silently leaves the tenant
      owing a full month they did not stay.
    - **Retire** charges for periods that now fall entirely past ``end_date``,
      so shortening a tenancy does not leave phantom future rent on the books.

    Waived charges are left untouched — the host has made an explicit decision
    about them, and regenerating would quietly undo it.

    Returns the number of rows inserted.
    """
    periods = period_math.periods_through(
        schedule.start_date, schedule.cadence, through, schedule.end_date,
    )
    existing = {
        c.period_start: c
        for c in await rent_charge_repo.list_for_schedule(db, schedule_id=schedule.id)
    }

    created = 0
    wanted: set[_dt.date] = set()
    for index, begin, finish in periods:
        wanted.add(begin)
        amount = period_math.prorated_amount(
            schedule.amount, begin, finish, schedule.start_date,
            schedule.cadence, index,
        )
        current = existing.get(begin)
        if current is None:
            await rent_charge_repo.create(
                db,
                user_id=schedule.user_id,
                organization_id=schedule.organization_id,
                applicant_id=schedule.applicant_id,
                schedule_id=schedule.id,
                charge_type="rent",
                period_start=begin,
                period_end=finish,
                # Rent is owed from the first day of the period it covers.
                # Whether being short of it counts as *late* is a separate
                # question, answered by the schedule's ``grace_days``.
                due_date=begin,
                amount=amount,
            )
            created += 1
            continue
        if current.waived_at is not None:
            continue
        if current.period_end != finish or current.amount != amount:
            current.period_end = finish
            current.amount = amount

    # Periods that no longer exist under the current end_date.
    for begin, charge in existing.items():
        if begin not in wanted and charge.waived_at is None:
            await rent_charge_repo.soft_delete(db, charge=charge)

    await db.flush()
    return created


async def ensure_charges_generated(
    db, *, organization_id: uuid.UUID, applicant_id: uuid.UUID,
    through: _dt.date | None = None,
) -> int:
    """Bring one tenant's charges up to date across all their schedules."""
    horizon = through or _today()
    schedules = await rent_schedule_repo.list_for_applicant(
        db, organization_id=organization_id, applicant_id=applicant_id,
    )
    total = 0
    for schedule in schedules:
        total += await _generate_charges_for_schedule(
            db, schedule=schedule, through=horizon,
        )
    return total


def _overdue_after(charge, schedules_by_id: dict) -> _dt.date | None:
    schedule = schedules_by_id.get(charge.schedule_id)
    if schedule is None or schedule.grace_days is None:
        return None
    return charge.due_date + _dt.timedelta(days=schedule.grace_days)


async def get_ledger(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    as_of: _dt.date | None = None,
) -> RentLedgerResponse:
    """The full rent picture for one tenant, charges refreshed first."""
    today = as_of or _today()

    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise TenantNotFoundError(str(applicant_id))

        await ensure_charges_generated(
            db, organization_id=organization_id,
            applicant_id=applicant_id, through=today,
        )

        schedules = list(
            await rent_schedule_repo.list_for_applicant(
                db, organization_id=organization_id, applicant_id=applicant_id,
            ),
        )
        charges = list(
            await rent_charge_repo.list_for_applicant(
                db, organization_id=organization_id, applicant_id=applicant_id,
            ),
        )
        payments = list(
            await rent_charge_repo.list_payments_for_applicant(
                db, organization_id=organization_id, applicant_id=applicant_id,
            ),
        )

    schedules_by_id = {s.id: s for s in schedules}

    result = allocate(
        charges=[
            ChargeInput(
                id=c.id,
                due_date=c.due_date,
                period_end=c.period_end,
                amount=c.amount,
                is_waived=c.waived_at is not None,
                overdue_after=_overdue_after(c, schedules_by_id),
                sort_key=(c.created_at, str(c.id)),
            )
            for c in charges
        ],
        payments=[
            PaymentInput(
                id=p.id,
                paid_on=p.transaction_date,
                amount=p.amount,
                sort_key=(p.created_at, str(p.id)),
            )
            for p in payments
        ],
    )

    charges_by_id = {c.id: c for c in charges}
    payments_by_id = {p.id: p for p in payments}
    settlement_by_id = {s.charge_id: s for s in result.settlements}

    cadence_by_charge = {
        c.id: (
            schedules_by_id[c.schedule_id].cadence
            if c.schedule_id in schedules_by_id
            else None
        )
        for c in charges
    }

    charge_responses: list[RentChargeResponse] = []
    for settlement in result.settlements:
        charge = charges_by_id[settlement.charge_id]
        charge_responses.append(
            RentChargeResponse(
                id=charge.id,
                schedule_id=charge.schedule_id,
                charge_type=charge.charge_type,
                period_start=charge.period_start,
                period_end=charge.period_end,
                due_date=charge.due_date,
                amount=charge.amount,
                description=charge.description,
                waived_at=charge.waived_at,
                waived_reason=charge.waived_reason,
                allocated=settlement.allocated,
                remaining=settlement.remaining,
                status=settlement.status(today),
                applications=[
                    RentPaymentApplication(
                        transaction_id=app.payment_id,
                        paid_on=payments_by_id[app.payment_id].transaction_date,
                        amount=app.amount,
                        payer_name=payments_by_id[app.payment_id].payer_name,
                        payment_total=payments_by_id[app.payment_id].amount,
                    )
                    for app in settlement.applications
                ],
            ),
        )

    # Which periods each payment landed on — the reverse of the applications
    # above, so the payment list can annotate every row.
    applied_labels: dict[uuid.UUID, list[str]] = {}
    for settlement in result.settlements:
        charge = charges_by_id[settlement.charge_id]
        label = _period_label(
            charge.period_start, charge.period_end,
            cadence_by_charge.get(charge.id),
        )
        for app in settlement.applications:
            applied_labels.setdefault(app.payment_id, []).append(label)

    payment_responses = [
        RentPaymentResponse(
            transaction_id=p.id,
            paid_on=p.transaction_date,
            amount=p.amount,
            payer_name=p.payer_name,
            payment_method=p.payment_method,
            unapplied=result.unapplied.get(p.id, _ZERO),
            applied_to=applied_labels.get(p.id, []),
        )
        for p in payments
    ]

    current = _current_period(
        charges=charges,
        settlement_by_id=settlement_by_id,
        cadence_by_charge=cadence_by_charge,
        as_of=today,
    )

    return RentLedgerResponse(
        applicant_id=applicant_id,
        as_of=today,
        schedules=[RentScheduleResponse.model_validate(s) for s in schedules],
        charges=charge_responses,
        payments=payment_responses,
        current_period=current,
        total_charged=result.total_charged,
        total_paid=result.total_allocated + result.total_unapplied,
        balance=result.balance,
        unapplied_credit=result.total_unapplied,
    )


def _current_period(
    *, charges, settlement_by_id, cadence_by_charge, as_of: _dt.date,
) -> RentPeriodSummary | None:
    """The rent charge whose period contains ``as_of``.

    Only ``rent`` charges qualify — a late fee dated today is not "this
    month's rent". When several match (overlapping one-offs are possible), the
    one that started most recently wins.
    """
    candidates = [
        c
        for c in charges
        if c.charge_type == "rent"
        and c.period_start <= as_of <= c.period_end
    ]
    if not candidates:
        return None
    charge = max(candidates, key=lambda c: (c.period_start, c.created_at))
    settlement = settlement_by_id[charge.id]
    return RentPeriodSummary(
        charge_id=charge.id,
        label=_period_label(
            charge.period_start, charge.period_end,
            cadence_by_charge.get(charge.id),
        ),
        period_start=charge.period_start,
        period_end=charge.period_end,
        amount=charge.amount,
        allocated=settlement.allocated,
        remaining=settlement.remaining,
        status=settlement.status(as_of),
    )
