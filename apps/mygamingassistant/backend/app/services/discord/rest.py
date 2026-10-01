"""Outbound Discord REST access for the MGA bot.

``make_rest_client`` is the single construction point so tests can patch it
with a ``httpx.MockTransport``-backed client (call it through the module —
``rest.make_rest_client()`` — so the patch is seen).

Every outbound call from a background task is bounded by
``REST_TIMEOUT_S`` via :func:`bounded` — the shared client already retries
429s, and a stuck call must never pin a worker.
"""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from typing import Final, TypeVar

from platform_shared.services.discord import DiscordRestClient

from app.core.config import settings

REST_TIMEOUT_S: Final = 8.0

T = TypeVar("T")


def make_rest_client() -> DiscordRestClient:
    return DiscordRestClient(settings.discord_bot_token)


async def bounded(call: Awaitable[T]) -> T:
    """Await a Discord REST call with the module timeout.

    A call Discord never answers ends in ``TimeoutError`` (this timeout) or —
    usually first — an ``httpx.HTTPError`` from the shared client's own
    session: its default 5 s httpx timeout, or a connection failure.  Callers
    handle both alongside ``DiscordApiError``.
    """
    return await asyncio.wait_for(call, timeout=REST_TIMEOUT_S)


def message_link(guild_id: str, channel_id: str, message_id: str) -> str:
    return f"https://discord.com/channels/{guild_id}/{channel_id}/{message_id}"
