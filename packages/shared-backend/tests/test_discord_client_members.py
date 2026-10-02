"""Unit tests for platform_shared.services.discord.client_members — a server's member list.

Offline, through ``httpx.MockTransport`` (as ``test_discord_client_events.py``):
the route and its query string, an empty answer, and the intent refusal's code.
"""
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from platform_shared.services.discord import MISSING_ACCESS, DiscordApiError, DiscordRestClient, GuildMembers

_GUILD = "800000000000000001"
_MEMBER = {"user": {"id": "500000000000000002", "username": "thrall"}, "nick": None, "roles": [], "pending": False}


class _Recorder:
    """Answers every request with *reply* and keeps each one's method, route and query."""

    def __init__(self, reply: Any = None, *, status: int = 200) -> None:
        self.reply = reply
        self.status = status
        self.requests: list[tuple[str, str, dict[str, str]]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/api/v10")
        self.requests.append((request.method, path, dict(request.url.params)))
        return httpx.Response(self.status, json=self.reply)


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> DiscordRestClient:
    async def _no_sleep(_seconds: float) -> None:
        return None

    return DiscordRestClient("token", transport=httpx.MockTransport(handler), sleep=_no_sleep)


def test_the_client_has_the_mixin() -> None:
    assert issubclass(DiscordRestClient, GuildMembers)


@pytest.mark.anyio
async def test_the_first_page_asks_for_a_thousand_from_the_start() -> None:
    recorder = _Recorder([_MEMBER])
    async with _client(recorder) as client:
        members = await client.list_guild_members(_GUILD)
    assert members == [_MEMBER]
    assert recorder.requests == [("GET", f"/guilds/{_GUILD}/members", {"limit": "1000", "after": "0"})]


@pytest.mark.anyio
async def test_a_later_page_starts_after_the_id_given() -> None:
    recorder = _Recorder([])
    async with _client(recorder) as client:
        members = await client.list_guild_members(_GUILD, limit=2, after="500000000000000002")
    assert members == []
    assert recorder.requests == [("GET", f"/guilds/{_GUILD}/members", {"limit": "2", "after": "500000000000000002"})]


@pytest.mark.anyio
async def test_the_intent_switched_off_raises_missing_access() -> None:
    recorder = _Recorder({"code": MISSING_ACCESS, "message": "Missing Access"}, status=403)
    async with _client(recorder) as client:
        with pytest.raises(DiscordApiError) as caught:
            await client.list_guild_members(_GUILD)
    assert caught.value.status == 403
    assert caught.value.code == 50001
