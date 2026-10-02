"""Raid notification worker — drains the ``wow_raid_notification`` outbox.

Runs every 60 seconds from the in-process APScheduler
(``app/services/scheduling/scheduler_service.py``) and is a no-op when
``DISCORD_ENABLED`` is false.  Production runs two uvicorn workers, so two
schedulers tick concurrently; correctness comes from the outbox, not from
the scheduler:

* **One claim per transaction.**  ``claim_due(limit=1)`` takes a row with
  ``FOR UPDATE SKIP LOCKED``, stamps ``claimed_at`` and commits.  The other
  process skips it (and a crashed claim is reclaimed after 10 minutes).
* **Network outside transactions.**  The message is planned from the DB in a
  short transaction, sent with every REST call bounded by
  ``rest.bounded``, then the outcome is recorded in a fresh transaction that
  re-locks the row (a cancel may have deleted it mid-flight — that's fine).
* **Isolation.**  Every notification is dispatched inside its own
  try/except; one failure is recorded on that row and the loop moves on.
* **Bounded runs.**  At most ``RUN_ITEM_CAP`` claims and
  ``RUN_TIME_BUDGET_S`` seconds per run — well inside the 10-minute
  stale-claim window, so a slow run is never double-processed.

Kinds
-----
``signup_nudge`` (channel, 48h/24h), ``ready_check`` (channel, 1h),
``consumables_reminder`` (the channel-less trigger row fans out one DM row
per player plus one ``dm_fallback`` row; each run's late pass DMs players
who sign up afterwards — see ``raid_consumables_round``), ``dm_fallback``
(one combined "I couldn't DM …" channel post per raid, after the DMs settle).
``raid_cancelled`` is never scheduled — ``/raid-admin cancel`` announces
synchronously and drops every pending row — so such a row is skipped.

Retries
-------
429 (after the shared client's own ``retry_after`` retries), 5xx, timeouts
and other Discord errors → ``mark_failed`` with exponential backoff; the row
is given up after ``MAX_ATTEMPTS``.  50007 on a DM is permanent →
``mark_undeliverable`` (no retry) and the player lands in the fallback post.
Channel posts carry a Discord ``nonce`` with ``enforce_nonce`` so a retry
after a lost response doesn't post twice.  Every Discord failure is logged
with its HTTP status and Discord error code.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Final

import httpx
from platform_shared.services.discord import (
    CANNOT_SEND_MESSAGES_TO_USER,
    DiscordApiError,
    DiscordRestClient,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_notification import MAX_ATTEMPTS, WowRaidNotification
from app.repositories.wow import (
    wow_raid_event_repo,
    wow_raid_guild_repo,
    wow_raid_member_pref_repo,
    wow_raid_notification_repo,
    wow_raid_signup_repo,
)
from app.services.discord import raid_copy, raid_notifications, rest
from app.services.discord.raid_views import unix
from app.services.wow import raid_consumables_round
from app.services.wow.raid_member_prefs_service import resolve_player
from app.services.wow.raid_composition import role_gaps
from app.services.wow.raid_consumables import UnknownRaidError, select_consumables
from app.services.wow.raid_text import display_title
from app.services.wow.raid_consumables_round import DM_STATUSES
from app.services.wow.raid_roster import SEAT_STATUSES, compute_roster_summary, ordered_user_ids

logger = logging.getLogger(__name__)

RUN_ITEM_CAP: Final = 100
RUN_TIME_BUDGET_S: Final = 240.0

# A scheduled raid this long past its start is marked completed.
COMPLETE_AFTER: Final = timedelta(hours=6)

# A channel post that couldn't go out within this long after its due time is
# dropped — a 48h nudge delivered at 24h, or a ready check after the pull,
# is noise.  DM rows carry their round's due_at — hours old for a late
# signup — so they aren't checked (they only need the raid not to have
# started).
MAX_LATENESS: Final[dict[str, timedelta]] = {
    "signup_nudge": timedelta(hours=6),
    "consumables_reminder": timedelta(hours=6),
    "ready_check": timedelta(minutes=30),
}

# The fallback post waits for the DMs it summarises to settle, re-checking
# every minute, but never longer than DM_FALLBACK_MAX_WAIT.
DM_FALLBACK_DELAY: Final = timedelta(minutes=2)
DM_FALLBACK_RECHECK: Final = timedelta(minutes=1)
DM_FALLBACK_MAX_WAIT: Final = timedelta(minutes=45)

_NONCE_LEN: Final = 25

SessionScope = Callable[[], AbstractAsyncContextManager[AsyncSession]]


# ---------------------------------------------------------------------------
# Outcomes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Sent:
    detail: str = ""


@dataclass(frozen=True)
class Skipped:
    reason: str


@dataclass(frozen=True)
class Failed:
    error: str


@dataclass(frozen=True)
class Undeliverable:
    error: str


@dataclass(frozen=True)
class Deferred:
    until: datetime


Outcome = Sent | Skipped | Failed | Undeliverable | Deferred


@dataclass
class RunStats:
    completed_events: int = 0
    late_dms: int = 0
    claimed: int = 0
    sent: int = 0
    skipped: int = 0
    failed: int = 0
    undeliverable: int = 0
    deferred: int = 0

    def count(self, outcome: Outcome) -> None:
        if isinstance(outcome, Sent):
            self.sent += 1
        elif isinstance(outcome, Skipped):
            self.skipped += 1
        elif isinstance(outcome, Failed):
            self.failed += 1
        elif isinstance(outcome, Undeliverable):
            self.undeliverable += 1
        else:
            self.deferred += 1


# ---------------------------------------------------------------------------
# Plans — what to send, built inside a DB transaction, sent outside it
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _Claim:
    id: uuid.UUID
    event_id: uuid.UUID
    kind: str
    target_user_id: str | None
    due_at: datetime

    @classmethod
    def of(cls, row: WowRaidNotification) -> "_Claim":
        return cls(
            id=row.id,
            event_id=row.event_id,
            kind=row.kind,
            target_user_id=row.target_user_id,
            due_at=row.due_at,
        )

    def log_fields(self) -> tuple[uuid.UUID, str, uuid.UUID]:
        return (self.id, self.kind, self.event_id)


@dataclass(frozen=True)
class _ChannelPlan:
    channel_id: str
    payloads: list[dict[str, Any]]


@dataclass(frozen=True)
class _DmPlan:
    user_id: str
    payload: dict[str, Any]


_Plan = _ChannelPlan | _DmPlan | Outcome


@dataclass(frozen=True)
class _Context:
    event: WowRaidEvent
    guild: WowRaidGuild
    now: datetime

    @property
    def label(self) -> str:
        return display_title(self.event)

    @property
    def starts_unix(self) -> int:
        return unix(self.event.starts_at)

    @property
    def signup_link(self) -> str | None:
        if self.event.message_id is None:
            return None
        return rest.message_link(self.guild.discord_guild_id, self.event.channel_id, self.event.message_id)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def _default_scope() -> SessionScope:
    # Resolved at call time so tests can rebind app.db.session.unit_of_work.
    from app.db import session as session_module

    return session_module.unit_of_work


async def process_due_notifications(
    *,
    now: datetime | None = None,
    session_scope: SessionScope | None = None,
    max_items: int = RUN_ITEM_CAP,
    time_budget_s: float = RUN_TIME_BUDGET_S,
) -> RunStats:
    """Send every due notification (up to the per-run caps).  Never raises.

    ``now`` pins the clock (tests); production reads the wall clock per claim.
    """
    stats = RunStats()
    if not settings.discord_enabled:
        return stats
    scope = session_scope or _default_scope()

    def clock() -> datetime:
        return now or datetime.now(timezone.utc)

    try:
        async with scope() as db:
            stats.completed_events = await wow_raid_event_repo.complete_started_events(
                db, started_before=clock() - COMPLETE_AFTER
            )
    except Exception:
        logger.exception("raid_notifications: completing finished raids failed")

    try:
        async with scope() as db:
            stats.late_dms = await raid_consumables_round.schedule_late_dms(db, clock())
    except Exception:
        logger.exception("raid_notifications: scheduling late consumables DMs failed")

    loop = asyncio.get_running_loop()
    deadline = loop.time() + time_budget_s
    try:
        async with rest.make_rest_client() as client:
            while stats.claimed < max_items and loop.time() < deadline:
                claim = await _claim_one(scope, clock())
                if claim is None:
                    break
                stats.claimed += 1
                moment = clock()
                outcome = await _dispatch_safely(client, scope, claim, moment)
                await _record(scope, claim, outcome, moment)
                stats.count(outcome)
    except Exception:
        logger.exception("raid_notifications: run aborted")

    if stats.claimed or stats.completed_events or stats.late_dms:
        logger.info(
            "raid_notifications: run done claimed=%d sent=%d skipped=%d failed=%d "
            "undeliverable=%d deferred=%d completed_events=%d late_dms=%d",
            stats.claimed, stats.sent, stats.skipped, stats.failed,
            stats.undeliverable, stats.deferred, stats.completed_events, stats.late_dms,
        )
    return stats


async def _claim_one(scope: SessionScope, now: datetime) -> _Claim | None:
    async with scope() as db:
        rows = await wow_raid_notification_repo.claim_due(db, now=now, limit=1)
        if not rows:
            return None
        return _Claim.of(rows[0])


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


async def _dispatch_safely(
    client: DiscordRestClient, scope: SessionScope, claim: _Claim, now: datetime
) -> Outcome:
    try:
        async with scope() as db:
            plan = await _plan(db, claim, now)
        if isinstance(plan, _ChannelPlan):
            return await _send_channel(client, claim, plan)
        if isinstance(plan, _DmPlan):
            return await _send_dm(client, claim, plan)
        return plan
    except DiscordApiError as exc:
        logger.warning(
            "raid_notifications: Discord refused id=%s kind=%s event=%s status=%d discord_code=%s",
            *claim.log_fields(), exc.status, exc.code,
        )
        return Failed(f"discord status={exc.status} code={exc.code}")
    except TimeoutError:
        logger.warning("raid_notifications: Discord timed out id=%s kind=%s event=%s", *claim.log_fields())
        return Failed("discord timeout")
    except httpx.HTTPError as exc:
        logger.warning(
            "raid_notifications: transport error id=%s kind=%s event=%s error=%s",
            *claim.log_fields(), type(exc).__name__,
        )
        return Failed(f"transport {type(exc).__name__}")
    except Exception as exc:
        logger.exception("raid_notifications: crashed id=%s kind=%s event=%s", *claim.log_fields())
        return Failed(f"unexpected {type(exc).__name__}")


async def _plan(db: AsyncSession, claim: _Claim, now: datetime) -> _Plan:
    if claim.kind == "raid_cancelled":
        return Skipped("cancel notices are sent by the cancel flow")
    event = await wow_raid_event_repo.get(db, claim.event_id)
    if event is None:
        return Skipped("event deleted")
    if event.status != "scheduled":
        return Skipped(f"event {event.status}")
    if event.starts_at <= now:
        return Skipped("raid already started")
    max_late = MAX_LATENESS.get(claim.kind)
    if claim.target_user_id is None and max_late is not None and now - claim.due_at > max_late:
        return Skipped("missed its window")
    guild = await wow_raid_guild_repo.get(db, event.guild_id)
    if guild is None:
        return Skipped("guild deleted")
    ctx = _Context(event=event, guild=guild, now=now)

    if claim.kind == "signup_nudge":
        return await _plan_nudge(db, ctx, claim)
    if claim.kind == "ready_check":
        return await _plan_ready_check(db, ctx)
    if claim.kind == "consumables_reminder" and claim.target_user_id is None:
        return await _fan_out_consumables(db, ctx)
    if claim.kind == "consumables_reminder":
        assert claim.target_user_id is not None
        if claim.due_at != raid_consumables_round.round_due_at(event, guild):
            return Skipped("raid time changed")  # the late pass DMs them in the new round
        return await _plan_consumables_dm(db, ctx, claim.target_user_id)
    if claim.kind == "dm_fallback":
        return await _plan_dm_fallback(db, ctx, claim)
    return Skipped(f"unknown kind {claim.kind}")


def _is_early_nudge(ctx: _Context, claim: _Claim) -> bool:
    """The furthest-out configured nudge (48h by default) is the 'early' one."""
    offset_minutes = round((ctx.event.starts_at - claim.due_at).total_seconds() / 60)
    offsets = [int(m) for m in ctx.guild.settings.get("nudge_offsets_minutes", [])] or [offset_minutes]
    return offset_minutes >= max(offsets)


async def _plan_nudge(db: AsyncSession, ctx: _Context, claim: _Claim) -> _Plan:
    signups = await wow_raid_signup_repo.list_for_event(db, ctx.event.id)
    summary = compute_roster_summary(signups, size_cap=ctx.event.size_cap)
    payload = raid_notifications.build_signup_nudge(
        raid_label=ctx.label,
        starts_unix=ctx.starts_unix,
        summary=summary,
        gaps=role_gaps(ctx.event.size_cap, summary.role_counts),
        early=_is_early_nudge(ctx, claim),
        ping_role_id=ctx.guild.ping_role_id,
        signup_link=ctx.signup_link,
    )
    if payload is None:
        return Skipped("raid is full")
    return _ChannelPlan(channel_id=ctx.event.channel_id, payloads=[payload])


async def _plan_ready_check(db: AsyncSession, ctx: _Context) -> _Plan:
    signups = await wow_raid_signup_repo.list_for_event(db, ctx.event.id)
    seated = ordered_user_ids(s for s in signups if s.status in SEAT_STATUSES)
    if not seated:
        return Skipped("nobody confirmed")
    payloads = raid_notifications.build_ready_check(
        raid_label=ctx.label, starts_unix=ctx.starts_unix, user_ids=seated
    )
    return _ChannelPlan(channel_id=ctx.event.channel_id, payloads=payloads)


async def _fan_out_consumables(db: AsyncSession, ctx: _Context) -> Outcome:
    """Turn the raid's trigger row into one DM row per player + the fallback row."""
    dms = await raid_consumables_round.schedule_dms(db, ctx.event, ctx.guild)
    if not dms.players:
        return Skipped("nobody to DM")
    await wow_raid_notification_repo.schedule_channel_row(
        db, event_id=ctx.event.id, kind="dm_fallback", due_at=dms.due_at + DM_FALLBACK_DELAY
    )
    return Sent(detail=f"round of {dms.players} DM(s), {dms.inserted} new")


async def _plan_consumables_dm(db: AsyncSession, ctx: _Context, user_id: str) -> _Plan:
    signup = await wow_raid_signup_repo.get(db, event_id=ctx.event.id, discord_user_id=user_id)
    if signup is None or signup.status not in DM_STATUSES:
        return Skipped("no longer signed up")
    pref = await wow_raid_member_pref_repo.get(db, guild_id=ctx.guild.id, discord_user_id=user_id)
    if pref is not None and pref.dm_opt_out:
        return Skipped("opted out of DMs")
    player = resolve_player(signup, pref)
    if player.wow_class is None:
        return _DmPlan(user_id, _generic_dm(ctx))
    role = raid_notifications.consumables_role(player.wow_class, player.role, player.spec)
    try:
        checklist = select_consumables(ctx.event.raid_key, player.wow_class, role)
    except UnknownRaidError:
        logger.warning("raid_notifications: no consumables data for raid_key=%s", ctx.event.raid_key)
        return _DmPlan(user_id, _generic_dm(ctx))
    title = raid_copy.consumables_title(
        ctx.label,
        raid_notifications.day_word(ctx.event.starts_at, ctx.now, ctx.guild.timezone),
        player.label,
    )
    payload = raid_notifications.build_consumables_dm(
        title=title, starts_unix=ctx.starts_unix, checklist=checklist, signup_link=ctx.signup_link
    )
    return _DmPlan(user_id, payload)


def _generic_dm(ctx: _Context) -> dict[str, Any]:
    return raid_notifications.build_generic_reminder_dm(
        raid_label=ctx.label, starts_unix=ctx.starts_unix, signup_link=ctx.signup_link
    )


async def _plan_dm_fallback(db: AsyncSession, ctx: _Context, claim: _Claim) -> _Plan:
    # The fallback row sits DM_FALLBACK_DELAY after the round it summarises.
    round_due_at = claim.due_at - DM_FALLBACK_DELAY
    pending = await wow_raid_notification_repo.count_pending_user_rows(
        db, event_id=ctx.event.id, kind="consumables_reminder", due_at=round_due_at
    )
    if pending and ctx.now < claim.due_at + DM_FALLBACK_MAX_WAIT:
        return Deferred(until=ctx.now + DM_FALLBACK_RECHECK)
    blocked = await wow_raid_notification_repo.dm_blocked_user_ids(
        db, event_id=ctx.event.id, kind="consumables_reminder", due_at=round_due_at
    )
    if not blocked:
        return Skipped("every DM was delivered")
    return _ChannelPlan(channel_id=ctx.event.channel_id, payloads=raid_notifications.build_dm_fallback(blocked))


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------


def _nonce(claim: _Claim, index: int) -> str:
    """Stable per (notification, chunk) so Discord drops a retried duplicate."""
    suffix = f"{index:02d}"
    return f"{claim.id.hex[: _NONCE_LEN - len(suffix)]}{suffix}"


async def _send_channel(client: DiscordRestClient, claim: _Claim, plan: _ChannelPlan) -> Outcome:
    for index, payload in enumerate(plan.payloads):
        body = {**payload, "nonce": _nonce(claim, index), "enforce_nonce": True}
        await rest.bounded(client.create_message(plan.channel_id, body))
    return Sent(detail=f"{len(plan.payloads)} message(s)")


async def _send_dm(client: DiscordRestClient, claim: _Claim, plan: _DmPlan) -> Outcome:
    body = {**plan.payload, "nonce": _nonce(claim, 0), "enforce_nonce": True}
    try:
        await rest.bounded(client.send_dm(plan.user_id, body))
    except DiscordApiError as exc:
        if exc.code != CANNOT_SEND_MESSAGES_TO_USER:
            raise
        logger.info(
            "raid_notifications: DMs closed id=%s kind=%s event=%s status=%d discord_code=%s",
            *claim.log_fields(), exc.status, exc.code,
        )
        return Undeliverable(wow_raid_notification_repo.DM_BLOCKED_ERROR)
    return Sent()


# ---------------------------------------------------------------------------
# Bookkeeping
# ---------------------------------------------------------------------------


async def _record(scope: SessionScope, claim: _Claim, outcome: Outcome, now: datetime) -> None:
    try:
        async with scope() as db:
            row = await wow_raid_notification_repo.get_for_update(db, claim.id)
            if row is None:
                logger.info(
                    "raid_notifications: row gone before bookkeeping (raid cancelled?) id=%s kind=%s event=%s",
                    *claim.log_fields(),
                )
                return
            await _apply(db, row, outcome, now)
        _log_outcome(claim, outcome)
    except Exception:
        # The claim stays stamped; claim_due reclaims it after the stale window.
        logger.exception("raid_notifications: bookkeeping failed id=%s kind=%s event=%s", *claim.log_fields())


async def _apply(db: AsyncSession, row: WowRaidNotification, outcome: Outcome, now: datetime) -> None:
    if isinstance(outcome, Sent):
        await wow_raid_notification_repo.mark_sent(db, row)
    elif isinstance(outcome, Skipped):
        await wow_raid_notification_repo.mark_skipped(db, row, reason=outcome.reason)
    elif isinstance(outcome, Undeliverable):
        await wow_raid_notification_repo.mark_undeliverable(db, row, error=outcome.error)
    elif isinstance(outcome, Deferred):
        await wow_raid_notification_repo.defer(db, row, until=outcome.until)
    else:
        await wow_raid_notification_repo.mark_failed(db, row, error=outcome.error, now=now)
        if row.attempts >= MAX_ATTEMPTS:
            logger.error(
                "raid_notifications: giving up id=%s kind=%s event=%s attempts=%d last_error=%s",
                row.id, row.kind, row.event_id, row.attempts, outcome.error,
            )


def _log_outcome(claim: _Claim, outcome: Outcome) -> None:
    if isinstance(outcome, Failed):
        return  # already logged with status + code where it happened
    logger.info(
        "raid_notifications: id=%s kind=%s event=%s outcome=%s",
        *claim.log_fields(), outcome,
    )
