"""Daily cost-unit quota for tutor turns: reserve, then reconcile or refund.

Two buckets in the shared ``daily_usage_counters`` table:

* ``ltutor:user:{user_id}`` -- per-user daily cap (LTUTOR_USER_DAILY_UNITS)
* ``ltutor:global``          -- whole-app daily cap (LTUTOR_GLOBAL_DAILY_UNITS)

A turn reserves its worst-case estimate on BOTH buckets, always user first
then global (fixed order, so concurrent turns can't deadlock on row locks),
inside the caller's transaction: a refused global reserve rolls the user
reserve back with it. The UTC day is pinned at reserve time and reused when
settling, so a turn that straddles midnight settles against the day it was
charged to.

Settlement:

* success                                    -> release ``reserved - actual``
                                                (or charge the overage)
* upstream error before any token streamed    -> release everything
* client disconnect / mid-stream failure      -> keep the reservation (tokens
                                                were generated and billed; the
                                                exact count is unknown)
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories.daily_quota_repo import (
    get_daily_usage,
    release_daily_quota,
    try_consume_daily_quota_amount,
    utc_today,
)

from app.core.config import settings

logger = logging.getLogger(__name__)

GLOBAL_BUCKET = "ltutor:global"


def user_bucket(user_id: uuid.UUID) -> str:
    return f"ltutor:user:{user_id}"


class QuotaError(Exception):
    """Base -- never raised directly."""


class TutorUnavailableError(QuotaError):
    """Global kill switch (cap 0) or the whole app's daily budget is spent."""


class DailyLimitReachedError(QuotaError):
    """This user's daily budget can't cover another turn."""


@dataclass(frozen=True)
class Reservation:
    user_id: uuid.UUID
    units: int
    day: date


def tutor_enabled() -> bool:
    """False when the operator flipped the kill switch or no API key is set."""
    return settings.ltutor_global_daily_units > 0 and bool(settings.anthropic_api_key)


async def reserve(db: AsyncSession, *, user_id: uuid.UUID, units: int) -> Reservation:
    """Reserve ``units`` on the user bucket, then the global bucket.

    Does NOT commit: the caller's transaction owns it, so raising here (or
    anywhere later in the same transaction) rolls both reservations back.
    """
    if settings.ltutor_global_daily_units <= 0:
        raise TutorUnavailableError("tutor kill switch is on")
    day = utc_today()
    if not await try_consume_daily_quota_amount(
        db,
        bucket=user_bucket(user_id),
        cap=settings.ltutor_user_daily_units,
        amount=units,
        day=day,
    ):
        logger.info("tutor quota: user daily cap reached user_id=%s units=%d", user_id, units)
        raise DailyLimitReachedError("daily limit reached")
    if not await try_consume_daily_quota_amount(
        db,
        bucket=GLOBAL_BUCKET,
        cap=settings.ltutor_global_daily_units,
        amount=units,
        day=day,
    ):
        logger.warning("tutor quota: GLOBAL daily cap reached units=%d", units)
        raise TutorUnavailableError("global daily cap reached")
    return Reservation(user_id=user_id, units=units, day=day)


async def refund(db: AsyncSession, reservation: Reservation) -> None:
    """Give the whole reservation back (the calls never produced tokens)."""
    await _release(db, reservation, reservation.units)


async def reconcile(db: AsyncSession, reservation: Reservation, *, actual_units: int) -> None:
    """Settle a finished turn: release the unused part, or charge the overage.

    The overage path only runs if the estimate was wrong (it is a deliberate
    upper bound). The turn already happened, so a cap that can't absorb the
    overage is logged rather than failing the turn.
    """
    delta = reservation.units - actual_units
    if delta > 0:
        await _release(db, reservation, delta)
        return
    if delta == 0:
        return
    overage = -delta
    buckets = (
        ("user", user_bucket(reservation.user_id), settings.ltutor_user_daily_units),
        ("global", GLOBAL_BUCKET, settings.ltutor_global_daily_units),
    )
    for label, bucket, cap in buckets:
        charged = await try_consume_daily_quota_amount(
            db, bucket=bucket, cap=cap, amount=overage, day=reservation.day,
        )
        if not charged:
            logger.warning(
                "tutor quota: %d-unit overage not charged to the %s bucket (cap reached)",
                overage,
                label,
            )


async def remaining_fraction(db: AsyncSession, user_id: uuid.UUID) -> float:
    """Share of today's per-user budget left, 0.0-1.0. Never exposes global numbers."""
    cap = settings.ltutor_user_daily_units
    if cap <= 0:
        return 0.0
    used = await get_daily_usage(db, bucket=user_bucket(user_id))
    return max(0.0, min(1.0, (cap - used) / cap))


async def can_afford(db: AsyncSession, user_id: uuid.UUID, *, units: int) -> bool:
    """Would a ``units`` reservation fit in this user's remaining budget today?

    Read-only pre-check for the UI (so a capped learner is told BEFORE they
    record). The authoritative check is ``reserve``.
    """
    cap = settings.ltutor_user_daily_units
    if cap <= 0:
        return False
    used = await get_daily_usage(db, bucket=user_bucket(user_id))
    return used + units <= cap


async def _release(db: AsyncSession, reservation: Reservation, units: int) -> None:
    await release_daily_quota(
        db, bucket=user_bucket(reservation.user_id), amount=units, day=reservation.day,
    )
    await release_daily_quota(db, bucket=GLOBAL_BUCKET, amount=units, day=reservation.day)
