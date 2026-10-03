"""Group-planner links: a leader's 2-hour key to one raid's groups.

Discord has already authenticated whoever presses [Groups] on Raid: Edit and
worked out their permissions (``raid_context.may_lead``), so the bot hands
that person a short-lived secret instead of a web login:

* :func:`mint` — a fresh token (``secrets.token_urlsafe(32)``, 256 bits) for
  (raid, leader).  Only its SHA-256 is stored, and minting again replaces
  the leader's previous link.  The raid's links that expired over a day ago
  are deleted on the way.
* :func:`resolve` — ``Authorization: RaidPlanner <token>`` on a raid's
  ``web_id`` → the access, or why not.  The lookup is by hash *and* the
  raid, so one raid's link is no key to another.

The token is never logged, and the hash never leaves the server.
"""
from __future__ import annotations

import hashlib
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_event_repo, wow_raid_plan_repo

PLAN_LINK_TTL: Final = timedelta(hours=2)
# An expired link says "expired" (not "invalid") for a day, then the raid's next mint deletes it.
_KEEP_EXPIRED: Final = timedelta(days=1)
# The Authorization scheme, compared without case.
SCHEME: Final = "RaidPlanner"
# secrets.token_urlsafe(32): 43 URL-safe base64 characters.
_TOKEN: Final = re.compile(r"[A-Za-z0-9_-]{43}")

# Why a planner request is refused (the API's 404 / 403 details).
RAID_NOT_FOUND: Final = "raid_not_found"
PLAN_LINK_INVALID: Final = "plan_link_invalid"
PLAN_LINK_EXPIRED: Final = "plan_link_expired"


@dataclass(frozen=True)
class PlanAccess:
    """A working link: the raid it opens, whose link it is, and when it stops working."""

    event: WowRaidEvent
    discord_user_id: str
    expires_at: datetime


def token_hash(token: str) -> str:
    """What's stored for *token*: its SHA-256, as hex."""
    return hashlib.sha256(token.encode("ascii")).hexdigest()


async def mint(db: AsyncSession, event: WowRaidEvent, user_id: str, now: datetime) -> str:
    """A new planner link for *user_id* on *event*, working for PLAN_LINK_TTL: its token, for the link only."""
    token = secrets.token_urlsafe(32)
    await wow_raid_plan_repo.delete_expired_links(db, event_id=event.id, before=now - _KEEP_EXPIRED)
    await wow_raid_plan_repo.upsert_link(
        db,
        event_id=event.id,
        discord_user_id=user_id,
        token_hash=token_hash(token),
        created_at=now,
        expires_at=now + PLAN_LINK_TTL,
    )
    return token


async def resolve(db: AsyncSession, web_id: uuid.UUID, authorization: str | None, now: datetime) -> PlanAccess | str:
    """The access *authorization* gives to *web_id*'s planner; else ``raid_not_found`` (unknown, or a
    draft), ``plan_link_invalid`` (no link, another scheme, or not this raid's) or ``plan_link_expired``.
    """
    event = await wow_raid_event_repo.get_by_web_id(db, web_id)
    if event is None or event.status == "draft":
        return RAID_NOT_FOUND
    token = _token(authorization)
    if token is None:
        return PLAN_LINK_INVALID
    link = await wow_raid_plan_repo.get_link(db, event_id=event.id, token_hash=token_hash(token))
    if link is None:
        return PLAN_LINK_INVALID
    if link.expires_at <= now:
        return PLAN_LINK_EXPIRED
    return PlanAccess(event=event, discord_user_id=link.discord_user_id, expires_at=link.expires_at)


def _token(authorization: str | None) -> str | None:
    """The token of a ``RaidPlanner <token>`` header; None for anything else."""
    if authorization is None:
        return None
    scheme, _, token = authorization.strip().partition(" ")
    token = token.strip()
    if scheme.lower() != SCHEME.lower() or not _TOKEN.fullmatch(token):
        return None
    return token
