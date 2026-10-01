"""Signup mutations for a raid — seat assignment, bench, FIFO promotion.

The caller owns the transaction and MUST hold the event's row lock
(``wow_raid_event_repo.get_for_update``) so concurrent clicks serialise.
Seat rules live in :mod:`app.services.wow.raid_roster` (pure); this module
applies them to the database.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.wow.raid_roster import BENCH_STATUS, pick_promotions, seat_status_for


@dataclass(frozen=True)
class StatusChange:
    """Result of a status request.

    outcome:   ``unchanged`` when the player already had exactly this signup.
    status:    the status the player ended up with.
    benched:   they asked for a seat and landed on the bench (raid full).
    promoted:  Discord user IDs moved bench → confirmed by this change.
    previous:  the status before this change; None for a new signup.
    """

    outcome: Literal["changed", "unchanged"]
    status: str
    benched: bool
    promoted: list[str] = field(default_factory=list)
    previous: str | None = None


async def change_status(
    db: AsyncSession,
    *,
    event: WowRaidEvent,
    discord_user_id: str,
    display_name: str,
    requested_status: str,
    wow_class: str | None,
    role: str | None,
    spec: str | None,
) -> StatusChange:
    """Apply a player's status request; bench if full; promote if a seat opened."""
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    mine = next((s for s in signups if s.discord_user_id == discord_user_id), None)
    status = seat_status_for(
        signups,
        discord_user_id=discord_user_id,
        requested_status=requested_status,
        size_cap=event.size_cap,
    )
    benched = status == BENCH_STATUS and requested_status != BENCH_STATUS
    previous = mine.status if mine is not None else None

    if mine is not None and (mine.status, mine.wow_class, mine.role, mine.spec) == (status, wow_class, role, spec):
        return StatusChange(outcome="unchanged", status=status, benched=benched, previous=previous)

    joins_bench = status == BENCH_STATUS and (mine is None or mine.status != BENCH_STATUS)
    await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event.id,
        discord_user_id=discord_user_id,
        display_name=display_name,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
        requeue=joins_bench,
    )
    promoted = await promote_from_bench(db, event)
    return StatusChange(outcome="changed", status=status, benched=benched, promoted=promoted, previous=previous)


async def promote_from_bench(db: AsyncSession, event: WowRaidEvent) -> list[str]:
    """Fill open seats from the bench, earliest first.  Returns promoted user IDs."""
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    to_promote: list[WowRaidSignup] = pick_promotions(signups, size_cap=event.size_cap)
    if not to_promote:
        return []
    now = datetime.now(timezone.utc)
    for signup in to_promote:
        signup.status = "confirmed"
        signup.updated_at = now
    await db.flush()
    return [signup.discord_user_id for signup in to_promote]
