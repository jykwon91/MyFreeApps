"""Unit tests for platform_shared.services.discord.client_events — scheduled events and threads.

Offline, through ``httpx.MockTransport`` (as ``test_discord_client.py``):
each method's HTTP method, route and body; an error's Discord code; the two
permission bits and their labels.
"""
import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from platform_shared.services.discord import (
    CREATE_EVENTS,
    CREATE_PUBLIC_THREADS,
    MANAGE_EVENTS,
    THREAD_ALREADY_CREATED,
    UNKNOWN_GUILD_SCHEDULED_EVENT,
    DiscordApiError,
    DiscordRestClient,
    ScheduledEventsAndThreads,
    has_permission,
    permission_labels,
)

_GUILD = "800000000000000001"
_CHANNEL = "700000000000000001"
_MESSAGE = "650000000000000001"
_EVENT = "640000000000000001"


class _Recorder:
    """Answers every request with *reply* and keeps what was asked."""

    def __init__(self, reply: Any = None, *, status: int = 200) -> None:
        self.reply = reply
        self.status = status
        self.requests: list[tuple[str, str, Any]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = None
        if request.content:
            body = json.loads(request.content)
        self.requests.append((request.method, request.url.path.removeprefix("/api/v10"), body))
        if self.status == 204:
            return httpx.Response(204)
        return httpx.Response(self.status, json=self.reply)


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> DiscordRestClient:
    async def _no_sleep(_seconds: float) -> None:
        return None

    return DiscordRestClient("token", transport=httpx.MockTransport(handler), sleep=_no_sleep)


def test_the_client_has_the_mixin() -> None:
    assert issubclass(DiscordRestClient, ScheduledEventsAndThreads)


@pytest.mark.anyio
async def test_create_event_posts_the_payload() -> None:
    recorder = _Recorder({"id": _EVENT, "creator_id": "1"})
    payload = {"name": "Onyxia", "entity_type": 3, "privacy_level": 2}
    async with _client(recorder) as client:
        created = await client.create_guild_scheduled_event(_GUILD, payload)
    assert created["id"] == _EVENT
    assert recorder.requests == [("POST", f"/guilds/{_GUILD}/scheduled-events", payload)]


@pytest.mark.anyio
async def test_list_events_gets_the_guild_route() -> None:
    recorder = _Recorder([{"id": _EVENT}])
    async with _client(recorder) as client:
        events = await client.list_guild_scheduled_events(_GUILD)
    assert events == [{"id": _EVENT}]
    assert recorder.requests == [("GET", f"/guilds/{_GUILD}/scheduled-events", None)]


@pytest.mark.anyio
async def test_modify_event_patches_only_the_fields_given() -> None:
    recorder = _Recorder({"id": _EVENT})
    async with _client(recorder) as client:
        await client.modify_guild_scheduled_event(_GUILD, _EVENT, {"name": "Onyxia's Lair"})
    assert recorder.requests == [("PATCH", f"/guilds/{_GUILD}/scheduled-events/{_EVENT}", {"name": "Onyxia's Lair"})]


@pytest.mark.anyio
async def test_delete_event_hits_the_event_route() -> None:
    recorder = _Recorder(status=204)
    async with _client(recorder) as client:
        assert await client.delete_guild_scheduled_event(_GUILD, _EVENT) is None
    assert recorder.requests == [("DELETE", f"/guilds/{_GUILD}/scheduled-events/{_EVENT}", None)]


@pytest.mark.anyio
async def test_a_gone_event_raises_its_code() -> None:
    recorder = _Recorder(
        {"code": UNKNOWN_GUILD_SCHEDULED_EVENT, "message": "Unknown Guild Scheduled Event"}, status=404
    )
    async with _client(recorder) as client:
        with pytest.raises(DiscordApiError) as caught:
            await client.modify_guild_scheduled_event(_GUILD, _EVENT, {"name": "x"})
    assert caught.value.status == 404
    assert caught.value.code == 10070


@pytest.mark.anyio
async def test_start_thread_posts_on_the_message() -> None:
    recorder = _Recorder({"id": _MESSAGE, "owner_id": "1"})
    payload = {"name": "Onyxia's Lair · Sat Oct 10", "auto_archive_duration": 10080}
    async with _client(recorder) as client:
        thread = await client.start_thread_from_message(_CHANNEL, _MESSAGE, payload)
    assert thread["id"] == _MESSAGE
    assert recorder.requests == [("POST", f"/channels/{_CHANNEL}/messages/{_MESSAGE}/threads", payload)]


@pytest.mark.anyio
async def test_a_second_thread_raises_already_created() -> None:
    recorder = _Recorder({"code": THREAD_ALREADY_CREATED, "message": "A thread has already been created"}, status=400)
    async with _client(recorder) as client:
        with pytest.raises(DiscordApiError) as caught:
            await client.start_thread_from_message(_CHANNEL, _MESSAGE, {"name": "x"})
    assert caught.value.code == 160004


@pytest.mark.anyio
async def test_modify_thread_patches_the_channel() -> None:
    recorder = _Recorder({"id": _MESSAGE})
    async with _client(recorder) as client:
        await client.modify_thread(_MESSAGE, {"archived": True})
    assert recorder.requests == [("PATCH", f"/channels/{_MESSAGE}", {"archived": True})]


def test_permission_bits_and_labels() -> None:
    assert CREATE_PUBLIC_THREADS == 1 << 35
    assert CREATE_EVENTS == 1 << 44
    assert permission_labels([CREATE_EVENTS, CREATE_PUBLIC_THREADS]) == ["Create Events", "Create Public Threads"]
    assert not has_permission(MANAGE_EVENTS, CREATE_EVENTS)
