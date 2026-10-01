"""Signup mutations for a raid — seat assignment, queue, promotion.

The caller owns the transaction and MUST hold the event's row lock
(``wow_raid_event_repo.get_for_update``) so concurrent clicks serialise.
Seat and order rules live in :mod:`app.services.wow.raid_roster` (pure);
this module applies them to the database.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.wow.raid_roster import (
    LINE_STATUSES,
    QUEUED_STATUS,
    SEAT_STATUSES,
    pick_promotions,
    queue_position,
    seat_status_for,
)


@dataclass(frozen=True)
class StatusChange:
    """Result of a status request.

    outcome:   ``unchanged`` when the player already had exactly this signup.
    status:    the status the player ended up with.
    queued:    they asked for a seat and landed in the queue (raid full).
    promoted:  Discord user IDs moved queue → confirmed by this change.
    previous:  the status before this change; None for a new signup.
    queue_position: 1-based place in the queue when the status is ``queued``.
    """

    outcome: Literal["changed", "unchanged"]
    status: str
    queued: bool
    promoted: list[str] = field(default_factory=list)
    previous: str | None = None
    queue_position: int | None = None


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
    """Apply a player's status request; queue if full; promote if a seat opened."""
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    mine = next((s for s in signups if s.discord_user_id == discord_user_id), None)
    status = seat_status_for(
        signups,
        discord_user_id=discord_user_id,
        requested_status=requested_status,
        size_cap=event.size_cap,
    )
    queued = status == QUEUED_STATUS
    previous = mine.status if mine is not None else None
    # Read before the upsert, which refreshes ``mine`` in place (populate_existing).
    seat_left_role = _seat_left_by(mine, status)

    if mine is not None and (mine.status, mine.wow_class, mine.role, mine.spec) == (status, wow_class, role, spec):
        return StatusChange(
            outcome="unchanged",
            status=status,
            queued=queued,
            previous=previous,
            queue_position=queue_position(signups, discord_user_id),
        )

    await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event.id,
        discord_user_id=discord_user_id,
        display_name=display_name,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
        requeue=_goes_to_the_back(previous, status),
    )
    promoted = await promote_from_queue(db, event, prefer_role=seat_left_role)
    position = None
    if queued:
        position = queue_position(await wow_raid_signup_repo.list_for_event(db, event.id), discord_user_id)
    return StatusChange(
        outcome="changed",
        status=status,
        queued=queued,
        promoted=promoted,
        previous=previous,
        queue_position=position,
    )


def _goes_to_the_back(previous: str | None, status: str) -> bool:
    """Reset ``signed_up_at`` (the order number) — Raid-Helper's ``preserve_order: half``.

    Joining the queue puts you at its end; taking a seat after tentative,
    bench or absence puts you at the end of the line.  Spec, class and
    confirmed ↔ late switches keep your place.  A new row starts at now().
    """
    if previous is None:
        return False
    if status == QUEUED_STATUS:
        return previous != QUEUED_STATUS
    return status in SEAT_STATUSES and previous not in LINE_STATUSES


def _seat_left_by(mine: WowRaidSignup | None, status: str) -> str | None:
    """The role of the seat this change gives up, if it gives one up."""
    if mine is None or mine.status not in SEAT_STATUSES or status in SEAT_STATUSES:
        return None
    return mine.role


async def promote_from_queue(
    db: AsyncSession, event: WowRaidEvent, *, prefer_role: str | None = None
) -> list[str]:
    """Fill open seats from the queue (see ``pick_promotions``).  Returns promoted user IDs."""
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    to_promote: list[WowRaidSignup] = pick_promotions(
        signups, size_cap=event.size_cap, prefer_role=prefer_role
    )
    if not to_promote:
        return []
    now = datetime.now(timezone.utc)
    for signup in to_promote:
        signup.status = "confirmed"
        signup.updated_at = now
    await db.flush()
    return [signup.discord_user_id for signup in to_promote]
