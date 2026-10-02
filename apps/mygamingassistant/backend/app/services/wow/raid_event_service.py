"""Raid event lifecycle — draft → posted → edited → cancelled (or deleted).

A posted raid's leader can also close and reopen its sign-ups (the raid
stays ``scheduled``), set when they close by themselves (a deadline, in
``raid_deadline``), ping everyone on it (at most once per ``PING_EVERY``),
and change its details from Raid: Edit — title, leader, description, banner,
color and its role and class limits — or delete it outright.

The caller owns the transaction (one per Discord interaction).  Mutations
that touch seats expect the event row lock to be held
(``wow_raid_event_repo.get_for_update``).

Notification outbox
-------------------
Posting schedules the nudge / consumables / ready-check rows
(``wow_raid_notification_repo.schedule_for_event``); a time edit reschedules
(cancel pending, then schedule); cancelling drops every pending row.  The
worker that sends them is ``app/services/wow/raid_notification_worker.py``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Final, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import (
    wow_raid_event_repo,
    wow_raid_member_pref_repo,
    wow_raid_notification_repo,
    wow_raid_signup_repo,
)
from app.services.wow.raid_deadline import (
    DeadlineChange,
    DeadlineError,
    deadline_at,
    deadline_passed,
    parse_deadline,
    reconcile,
)
from app.services.wow.raid_roster import compute_roster_summary, listed_user_ids
from app.services.wow.raid_signup_service import promote_from_queue

PostOutcome = Literal["posted", "already_posted", "in_past", "deadline_passed", "gone"]
# What Raid: Edit → Deadline did; only the first five write anything.
DeadlineKind = Literal[
    "set", "cleared", "reopened", "closed_now", "draft_passed", "same", "format", "too_long", "started"
]
_DEADLINE_WRITES: Final = ("set", "cleared", "reopened", "closed_now", "draft_passed")
_KIND_OF_CHANGE: Final[dict[DeadlineChange, DeadlineKind]] = {"closed": "closed_now", "reopened": "reopened"}

# Ping signed members goes out at most once per raid this often.
PING_EVERY: Final = timedelta(minutes=5)


@dataclass(frozen=True)
class EditOutcome:
    """``min_size`` is set when the requested size is below the seats taken.

    ``deadline``: what a move did to sign-ups by the deadline (closed them, or reopened them).
    """

    min_size: int | None = None
    promoted: list[str] = field(default_factory=list)
    time_changed: bool = False
    deadline: DeadlineChange | None = None


@dataclass(frozen=True)
class DeadlineSaved:
    """What Raid: Edit → Deadline did, the deadline now (minutes) and when it closes sign-ups (unix).

    ``still_closed``: sign-ups stay closed — the leader's close, or the deadline's own.
    """

    kind: DeadlineKind
    minutes: int | None = None
    closes_unix: int | None = None
    still_closed: bool = False

    @property
    def changed(self) -> bool:
        """Whether anything was written (a posted raid's post then needs re-rendering)."""
        return self.kind in _DEADLINE_WRITES


async def create_draft(
    db: AsyncSession,
    *,
    guild: WowRaidGuild,
    raid_key: str,
    starts_at: datetime,
    size_cap: int,
    notes: str | None,
    created_by_user_id: str,
    created_by_display_name: str,
) -> WowRaidEvent:
    """Create the event in ``draft`` — it backs the organiser's private preview."""
    assert guild.raid_channel_id is not None, "guild must be configured before creating raids"
    return await wow_raid_event_repo.create(
        db,
        guild_id=guild.id,
        raid_key=raid_key,
        starts_at=starts_at,
        size_cap=size_cap,
        channel_id=guild.raid_channel_id,
        created_by_user_id=created_by_user_id,
        created_by_display_name=created_by_display_name,
        notes=notes,
        status="draft",
    )


async def mark_posting(
    db: AsyncSession, *, event: WowRaidEvent, guild: WowRaidGuild, now: datetime
) -> PostOutcome:
    """Flip a locked draft to ``scheduled`` and schedule its notifications.

    Idempotent: a second [Post raid] click finds the event already scheduled
    and returns ``already_posted`` without touching anything.
    """
    if event.status == "scheduled":
        return "already_posted"
    if event.status != "draft":
        return "gone"
    if event.starts_at <= now:
        return "in_past"
    if deadline_passed(event, now):
        return "deadline_passed"
    event.status = "scheduled"
    # Post into the guild's current raid channel (setup may have changed
    # since the preview was created).
    if guild.raid_channel_id:
        event.channel_id = guild.raid_channel_id
    await db.flush()
    await wow_raid_notification_repo.schedule_for_event(
        db, event_id=event.id, starts_at=event.starts_at, guild_settings=guild.settings, now=now
    )
    return "posted"


async def revert_to_draft(db: AsyncSession, event: WowRaidEvent) -> None:
    """Undo ``mark_posting`` after Discord refused the public post."""
    event.status = "draft"
    event.message_id = None
    await db.flush()
    await wow_raid_notification_repo.cancel_pending_for_event(db, event.id)


async def discard_draft(db: AsyncSession, event: WowRaidEvent) -> bool:
    """Delete a draft.  Returns False if it was already posted (nothing done)."""
    if event.status != "draft":
        return False
    await wow_raid_event_repo.delete(db, event)
    return True


async def edit_event(
    db: AsyncSession,
    *,
    event: WowRaidEvent,
    guild: WowRaidGuild,
    starts_at: datetime | None,
    size_cap: int | None,
    notes: str | None,
    now: datetime,
) -> EditOutcome:
    """Apply an edit.  Rejects a size below the seats already taken."""
    if size_cap is not None:
        signups = await wow_raid_signup_repo.list_for_event(db, event.id)
        seats_taken = compute_roster_summary(signups, size_cap=event.size_cap).seats_taken
        if size_cap < seats_taken:
            return EditOutcome(min_size=seats_taken)
        event.size_cap = size_cap
    if notes is not None:
        event.notes = notes
    time_changed = starts_at is not None and starts_at != event.starts_at
    if starts_at is not None:
        event.starts_at = starts_at
    await db.flush()

    deadline: DeadlineChange | None = None
    # A draft's notifications are scheduled when it's posted (``mark_posting``).
    if time_changed and event.status == "scheduled":
        await wow_raid_notification_repo.cancel_pending_for_event(db, event.id)
        await wow_raid_notification_repo.schedule_for_event(
            db, event_id=event.id, starts_at=event.starts_at, guild_settings=guild.settings, now=now
        )
        # Moved, always into the future: the post is live again and the deadline counts from the new start.
        await wow_raid_event_repo.set_start_applied(db, event, None)
        deadline = await apply_deadline(db, event, now)

    promoted: list[str] = []
    if size_cap is not None:
        promoted = await promote_from_queue(db, event)
    return EditOutcome(promoted=promoted, time_changed=time_changed, deadline=deadline)


async def set_title(db: AsyncSession, event: WowRaidEvent, title: str | None) -> None:
    """Raid: Edit → Title; None goes back to the raid's own name."""
    event.title = title
    await db.flush()


async def set_leader(db: AsyncSession, event: WowRaidEvent, *, user_id: str, display_name: str) -> None:
    """Raid: Edit → Leader: they get the raid's leader tools and the post names them."""
    event.leader_user_id = user_id
    event.leader_display_name = display_name
    await db.flush()


async def set_description(db: AsyncSession, event: WowRaidEvent, notes: str | None) -> None:
    """Raid: Edit → Description; None removes it."""
    event.notes = notes
    await db.flush()


async def set_banner(db: AsyncSession, event: WowRaidEvent, image_url: str | None) -> None:
    """Raid: Edit → Image; None goes back to the raid's own banner."""
    event.image_url = image_url
    await db.flush()


async def set_color(db: AsyncSession, event: WowRaidEvent, color: int | None) -> None:
    """Raid: Edit → Color; None goes back to the default."""
    event.color = color
    await db.flush()


async def set_mentions(db: AsyncSession, event: WowRaidEvent, role_ids: list[str]) -> None:
    """Create preview → Mentions: the roles the raid pings ([] = nobody)."""
    event.mention_role_ids = role_ids
    await db.flush()


async def set_role_limits(db: AsyncSession, event: WowRaidEvent, limits: dict[str, int]) -> None:
    """Raid: Edit → Role limits ({} = no limits, stored as null)."""
    await wow_raid_event_repo.set_role_limits(db, event, limits or None)


async def set_class_limits(db: AsyncSession, event: WowRaidEvent, limits: dict[str, int]) -> None:
    """Raid: Edit → Class limits ({} = no limits, stored as null)."""
    await wow_raid_event_repo.set_class_limits(db, event, limits or None)


async def set_signup_notes_enabled(db: AsyncSession, event: WowRaidEvent, enabled: bool) -> bool:
    """Raid: Edit → Notes: members may leave the leader a note, or not (off hides the notes, keeping them).

    False when it already was, e.g. a second leader's card that sat open.
    """
    if event.signup_notes_enabled == enabled:
        return False
    await wow_raid_event_repo.set_signup_notes_enabled(db, event, enabled)
    return True


async def delete_event(db: AsyncSession, event: WowRaidEvent) -> None:
    """Raid: Edit → Delete raid: the raid, its sign-ups and its pending notifications go.

    Sign-ups and notifications go with it (ON DELETE CASCADE).  Nobody is
    told; removing the post is the caller's background work.
    """
    await wow_raid_event_repo.delete(db, event)


async def set_cancel_reason(db: AsyncSession, event: WowRaidEvent, reason: str | None) -> None:
    """Stage the reason shown on the cancelled embed (before the organiser confirms)."""
    event.cancel_reason = reason
    await db.flush()


async def cancel_event(db: AsyncSession, *, event: WowRaidEvent, guild: WowRaidGuild) -> list[str]:
    """Cancel a scheduled raid; return the user IDs to tell by DM (opt-outs removed)."""
    await wow_raid_event_repo.cancel(db, event)
    await wow_raid_notification_repo.cancel_pending_for_event(db, event.id)
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    return await dm_recipients(db, guild=guild, user_ids=listed_user_ids(signups))


async def set_signups_closed(db: AsyncSession, event: WowRaidEvent, *, closed: bool, now: datetime) -> bool:
    """Close sign-ups (Raid: Close) or reopen them (Raid: Open); False when they already were.

    A closed raid stays ``scheduled``: /raid list, edits, the ready check and
    consumables DMs carry on; only the sign-up nudge stops (the worker skips it).
    A deadline that's due is applied first, so it closes them as the deadline's;
    a reopen keeps it applied, so after the deadline it holds until the start.
    """
    await apply_deadline(db, event, now)
    if (event.closed_at is not None) == closed:
        return False
    closed_at = None
    reason = None
    if closed:
        closed_at = now
        reason = "leader"
    await wow_raid_event_repo.set_close_state(
        db, event, closed_at=closed_at, close_reason=reason, applied_at=event.deadline_applied_at
    )
    return True


async def apply_deadline(db: AsyncSession, event: WowRaidEvent, now: datetime) -> DeadlineChange | None:
    """Square a posted raid's sign-ups with its deadline (``raid_deadline.reconcile``).

    ``"closed"`` when the deadline just closed them, ``"reopened"`` when a later
    or cleared deadline undid its own close, else None.  A draft keeps its
    deadline for when it's posted.
    """
    if event.status != "scheduled":
        return None
    result = reconcile(event, now)
    if result is None:
        return None
    await wow_raid_event_repo.set_close_state(
        db, event, closed_at=result.closed_at, close_reason=result.close_reason, applied_at=result.applied_at
    )
    return result.change


async def set_signup_deadline(db: AsyncSession, event: WowRaidEvent, text: str, *, now: datetime) -> DeadlineSaved:
    """Raid: Edit → Deadline (and More options): how long before the start sign-ups close.

    Nothing is written when the form doesn't read, says what's there already,
    or the raid has started.  A new deadline is applied afresh, so it replaces
    a reopen after the old one; a leader's close stays.
    """
    try:
        minutes = parse_deadline(text)
    except DeadlineError as exc:
        return DeadlineSaved(exc.kind)
    if event.status == "scheduled" and event.starts_at <= now:
        return DeadlineSaved("started", minutes)
    if minutes == event.signup_deadline_minutes:
        return DeadlineSaved("same", minutes)
    await wow_raid_event_repo.set_signup_deadline(db, event, minutes)
    kind = await _saved_kind(db, event, now)
    closes = deadline_at(event)
    closes_unix = None
    if closes is not None:
        closes_unix = int(closes.timestamp())
    return DeadlineSaved(kind, minutes, closes_unix, still_closed=event.closed_at is not None)


async def _saved_kind(db: AsyncSession, event: WowRaidEvent, now: datetime) -> DeadlineKind:
    """What a new deadline did: a posted raid's sign-ups are squared with it; a draft only keeps it."""
    if event.status == "draft":
        if deadline_passed(event, now):
            return "draft_passed"
    else:
        change = await apply_deadline(db, event, now)
        if change is not None:
            return _KIND_OF_CHANGE[change]
    if event.signup_deadline_minutes is None:
        return "cleared"
    return "set"


def ping_ready(event: WowRaidEvent, now: datetime) -> bool:
    """False while the raid's last ping is under ``PING_EVERY`` old."""
    return event.last_pinged_at is None or now - event.last_pinged_at >= PING_EVERY


async def claim_ping(db: AsyncSession, event: WowRaidEvent, *, now: datetime) -> bool:
    """Record a ping going out now; False while the last one is too recent.

    Expects the event row lock, so two leaders submitting at once send one ping.
    """
    if not ping_ready(event, now):
        return False
    event.last_pinged_at = now
    await db.flush()
    return True


async def release_ping(db: AsyncSession, event: WowRaidEvent, *, claimed_at: datetime) -> None:
    """Hand back a ping that never went out, unless a later one claimed the slot since."""
    if event.last_pinged_at == claimed_at:
        event.last_pinged_at = None
        await db.flush()


async def dm_recipients(db: AsyncSession, *, guild: WowRaidGuild, user_ids: list[str]) -> list[str]:
    """Filter ``user_ids`` down to players who haven't opted out of DMs."""
    opted_out = await wow_raid_member_pref_repo.opted_out_user_ids(
        db, guild_id=guild.id, discord_user_ids=user_ids
    )
    return [user_id for user_id in user_ids if user_id not in opted_out]
