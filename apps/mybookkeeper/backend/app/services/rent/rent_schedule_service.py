"""Create / update / end rent schedules, and add or waive one-off charges.

Holds the invariant the database cannot: live schedules for one applicant must
never overlap in time. Expressing that in Postgres needs
``EXCLUDE ... USING gist`` over ``(applicant_id, daterange)``, which requires
the ``btree_gist`` extension and has no SQLite equivalent for the test suite,
so it is checked here on every write instead.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from decimal import Decimal

from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.rent import rent_charge_repo, rent_schedule_repo
from app.schemas.rent.rent_schedule_response import RentScheduleResponse
from app.services.rent import rent_ledger_service

logger = logging.getLogger(__name__)


class TenantNotFoundError(LookupError):
    """No applicant with that id in this organization."""


class ScheduleNotFoundError(LookupError):
    pass


class ChargeNotFoundError(LookupError):
    pass


class OverlappingScheduleError(ValueError):
    """The requested date range collides with an existing live schedule."""


def _overlaps(
    a_start: _dt.date,
    a_end: _dt.date | None,
    b_start: _dt.date,
    b_end: _dt.date | None,
) -> bool:
    """Half-open-free overlap test for two inclusive, possibly open ranges.

    ``None`` end means open-ended, so it extends past every other range.
    """
    if a_end is not None and a_end < b_start:
        return False
    if b_end is not None and b_end < a_start:
        return False
    return True


async def _assert_applicant_is_ours(
    db, *, organization_id: uuid.UUID, user_id: uuid.UUID, applicant_id: uuid.UUID,
) -> None:
    applicant = await applicant_repo.get(
        db,
        applicant_id=applicant_id,
        organization_id=organization_id,
        user_id=user_id,
    )
    if applicant is None:
        raise TenantNotFoundError(str(applicant_id))


async def _assert_no_overlap(
    db,
    *,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID,
    start_date: _dt.date,
    end_date: _dt.date | None,
    ignore_schedule_id: uuid.UUID | None = None,
) -> None:
    existing = await rent_schedule_repo.list_for_applicant(
        db, organization_id=organization_id, applicant_id=applicant_id,
    )
    for other in existing:
        if ignore_schedule_id is not None and other.id == ignore_schedule_id:
            continue
        if _overlaps(start_date, end_date, other.start_date, other.end_date):
            raise OverlappingScheduleError(
                f"overlaps the schedule starting {other.start_date.isoformat()}"
                + (
                    f" and ending {other.end_date.isoformat()}"
                    if other.end_date
                    else " (open-ended)"
                ),
            )


async def create_schedule(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    amount: Decimal,
    cadence: str,
    start_date: _dt.date,
    property_id: uuid.UUID | None = None,
    end_date: _dt.date | None = None,
    grace_days: int | None = None,
    notes: str | None = None,
) -> RentScheduleResponse:
    async with unit_of_work() as db:
        await _assert_applicant_is_ours(
            db, organization_id=organization_id,
            user_id=user_id, applicant_id=applicant_id,
        )
        await _assert_no_overlap(
            db,
            organization_id=organization_id,
            applicant_id=applicant_id,
            start_date=start_date,
            end_date=end_date,
        )
        schedule = await rent_schedule_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            applicant_id=applicant_id,
            property_id=property_id,
            amount=amount,
            cadence=cadence,
            start_date=start_date,
            end_date=end_date,
            grace_days=grace_days,
            notes=notes,
        )
        # Materialize immediately so the ledger is populated the moment the
        # host saves, rather than on some later read.
        await rent_ledger_service.ensure_charges_generated(
            db, organization_id=organization_id, applicant_id=applicant_id,
        )
        return RentScheduleResponse.model_validate(schedule)


async def update_schedule(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    schedule_id: uuid.UUID,
    end_date: _dt.date | None = None,
    grace_days: int | None = None,
    notes: str | None = None,
    fields_set: set[str] | None = None,
) -> RentScheduleResponse:
    """Patch a schedule. ``fields_set`` distinguishes "omitted" from "set to null"."""
    touched = fields_set or set()
    async with unit_of_work() as db:
        schedule = await rent_schedule_repo.get(
            db, organization_id=organization_id, schedule_id=schedule_id,
        )
        if schedule is None:
            raise ScheduleNotFoundError(str(schedule_id))

        if "end_date" in touched:
            if end_date is not None and end_date < schedule.start_date:
                raise ValueError("end_date must not precede start_date")
            await _assert_no_overlap(
                db,
                organization_id=organization_id,
                applicant_id=schedule.applicant_id,
                start_date=schedule.start_date,
                end_date=end_date,
                ignore_schedule_id=schedule.id,
            )
            schedule.end_date = end_date
        if "grace_days" in touched:
            schedule.grace_days = grace_days
        if "notes" in touched:
            schedule.notes = notes

        await db.flush()
        applicant_id = schedule.applicant_id
        await rent_ledger_service.ensure_charges_generated(
            db, organization_id=organization_id, applicant_id=applicant_id,
        )
        await db.refresh(schedule)
        return RentScheduleResponse.model_validate(schedule)


async def delete_schedule(
    *, organization_id: uuid.UUID, schedule_id: uuid.UUID,
) -> None:
    """Soft-delete a schedule.

    Charges it already generated are deliberately left alone — they record what
    was genuinely owed, and the ``ON DELETE SET NULL`` on ``schedule_id`` means
    they survive as one-offs. To stop future charges without touching history,
    set ``end_date`` instead.
    """
    async with unit_of_work() as db:
        schedule = await rent_schedule_repo.get(
            db, organization_id=organization_id, schedule_id=schedule_id,
        )
        if schedule is None:
            raise ScheduleNotFoundError(str(schedule_id))
        await rent_schedule_repo.soft_delete(db, schedule=schedule)


async def add_charge(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    amount: Decimal,
    due_date: _dt.date,
    charge_type: str = "other",
    period_start: _dt.date | None = None,
    period_end: _dt.date | None = None,
    description: str | None = None,
):
    """Add a one-off charge (late fee, utility reimbursement, deposit).

    A one-off with no explicit span collapses to a single day at ``due_date``,
    which keeps ``period_end >= period_start`` true and makes the overdue rule
    fire the day after it is due.
    """
    begin = period_start or due_date
    finish = period_end or max(begin, due_date)
    if finish < begin:
        raise ValueError("period_end must not precede period_start")

    async with unit_of_work() as db:
        await _assert_applicant_is_ours(
            db, organization_id=organization_id,
            user_id=user_id, applicant_id=applicant_id,
        )
        charge = await rent_charge_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            applicant_id=applicant_id,
            schedule_id=None,
            charge_type=charge_type,
            period_start=begin,
            period_end=finish,
            due_date=due_date,
            amount=amount,
            description=description,
        )
        return charge.id


async def waive_charge(
    *, organization_id: uuid.UUID, charge_id: uuid.UUID, reason: str,
) -> None:
    async with unit_of_work() as db:
        charge = await rent_charge_repo.get(
            db, organization_id=organization_id, charge_id=charge_id,
        )
        if charge is None:
            raise ChargeNotFoundError(str(charge_id))
        charge.waived_at = _dt.datetime.now(_dt.timezone.utc)
        charge.waived_reason = reason
        await db.flush()


async def unwaive_charge(
    *, organization_id: uuid.UUID, charge_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        charge = await rent_charge_repo.get(
            db, organization_id=organization_id, charge_id=charge_id,
        )
        if charge is None:
            raise ChargeNotFoundError(str(charge_id))
        charge.waived_at = None
        charge.waived_reason = None
        await db.flush()


async def delete_charge(
    *, organization_id: uuid.UUID, charge_id: uuid.UUID,
) -> None:
    """Soft-delete a charge.

    Only sensible for one-offs: a generated charge deleted this way is
    regenerated on the next ledger read, because the generator keys on live
    rows. Waive it instead to make it stop counting.
    """
    async with unit_of_work() as db:
        charge = await rent_charge_repo.get(
            db, organization_id=organization_id, charge_id=charge_id,
        )
        if charge is None:
            raise ChargeNotFoundError(str(charge_id))
        await rent_charge_repo.soft_delete(db, charge=charge)
