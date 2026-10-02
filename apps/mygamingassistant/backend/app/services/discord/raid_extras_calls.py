"""What ``raid_extras`` and ``raid_extras_thread`` share: the raid as a sync read it, and one Discord call.

A call's refusal or silence comes back as an :class:`Answer`, never raised,
and :func:`warn` logs it once with Discord's status and code.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx
from platform_shared.services.discord import DiscordApiError

from app.services.discord import rest
from app.services.wow.raid_extras_rules import Plan, classify

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Raid:
    """What a sync needs once its read has closed (plain values)."""

    event_id: uuid.UUID
    guild_discord_id: str
    channel_id: str
    message_id: str
    starts_at: datetime
    post_link: str
    payload: dict[str, Any]
    thread_name: str
    discord_event_id: str | None
    thread_id: str | None
    plan: Plan


@dataclass(frozen=True)
class Answer:
    """One Discord call: its body when it went through, else Discord's status and code (None: no answer)."""

    ok: bool
    body: Any = None
    status: int | None = None
    code: int | None = None

    @property
    def kind(self) -> str:
        """``ok``, or what ``classify`` makes of the failure."""
        if self.ok:
            return "ok"
        return classify(self.status, self.code)

    @property
    def error(self) -> int | None:
        """What a refusal stores: Discord's code, else the HTTP status."""
        if self.code is not None:
            return self.code
        return self.status


async def ask(call: Awaitable[Any]) -> Answer:
    """One bounded Discord call; a refusal or silence comes back as an answer, never raised."""
    try:
        return Answer(True, await rest.bounded(call))
    except DiscordApiError as exc:
        return Answer(False, status=exc.status, code=exc.code)
    except (TimeoutError, httpx.HTTPError):
        return Answer(False)


def warn(answer: Answer, part: str, step: str, event_id: uuid.UUID) -> None:
    """Log a failed call once, with Discord's status and code."""
    verdict = "didn't answer"
    if answer.status is not None:
        verdict = "refused"
    logger.warning(
        "Raid bot: Discord %s the %s %s for raid %s (status %s, code %s)",
        verdict,
        part,
        step,
        event_id,
        answer.status,
        answer.code,
    )
