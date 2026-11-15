"""Hand a lease over to its successor once the successor has started.

A lease's ``starts_on`` is a calendar date in the host's own time zone, while
the server runs in UTC. A successor starting Nov 15 must not end the current
lease at 6pm Chicago on Nov 14 just because it is already Nov 15 in UTC, so
each hand-over waits for ``starts_on`` to arrive in the host's zone.

The only host time zone MBK stores is the one on a tenant's rent reminder
plan, so that is the source: the successor's tenant's plan, else the current
tenant's plan, else ``DEFAULT_HANDOVER_TIMEZONE``.
"""
from __future__ import annotations

import datetime as _dt
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import local_date
from app.core.lease_handover_constants import DEFAULT_HANDOVER_TIMEZONE, LATEST_UTC_OFFSET
from app.db.session import unit_of_work
from app.models.leases.signed_lease import SignedLease
from app.repositories.leases import signed_lease_repo
from app.repositories.rent import rent_reminder_plan_repo

logger = logging.getLogger(__name__)


async def _host_timezone(
    db: AsyncSession, *, parent: SignedLease, successor: SignedLease,
) -> str:
    for applicant_id in (successor.applicant_id, parent.applicant_id):
        plan = await rent_reminder_plan_repo.get_for_applicant(
            db, organization_id=parent.organization_id, applicant_id=applicant_id,
        )
        if plan is not None:
            return plan.timezone
    return DEFAULT_HANDOVER_TIMEZONE


async def end_replaced_leases(*, now: _dt.datetime) -> int:
    """Mark ``ended`` every signed/active lease whose successor has started
    in the host's time zone. Returns how many were ended.

    Tenancy-agnostic — runs across every user. A failure on one lease is
    logged and left for the next run; it never stops the rest.
    """
    ended = 0
    async with unit_of_work() as db:
        candidates = await signed_lease_repo.list_replaced_with_successor_starting_on_or_before(
            db, cutoff=(now + LATEST_UTC_OFFSET).date(),
        )
        for parent, successor in candidates:
            try:
                zone = await _host_timezone(db, parent=parent, successor=successor)
                if successor.starts_on is None or successor.starts_on > local_date(now, zone):
                    continue
                await signed_lease_repo.update_lease(
                    db,
                    lease_id=parent.id,
                    user_id=parent.user_id,
                    organization_id=parent.organization_id,
                    fields={"status": "ended", "ended_at": now, "updated_at": now},
                )
                ended += 1
                logger.info(
                    "Auto-ended lease %s (successor's starts_on reached in %s)",
                    parent.id, zone,
                )
            except Exception:  # noqa: BLE001 — one bad row must not block the rest
                logger.exception(
                    "Failed to auto-end lease %s — leaving for next cycle", parent.id,
                )
    return ended
