"""Unit tests for platform_shared.services.discord.client_pins — pin and unpin a message.

Offline, through ``httpx.MockTransport`` (as ``test_discord_client_members.py``):
the routes and methods, the 204 answer, and Discord's refusals surfacing as
``DiscordApiError`` codes — a missing Pin Messages, a full pin list, a deleted
message.
"""
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from platform_shared.services.discord import (
    MAX_PINS,
    MISSING_PERMISSIONS,
    PIN_MESSAGES,
    UNKNOWN_MESSAGE,
    DiscordApiError,
    DiscordRestClient,
    MessagePins,
    permission_labels,
)
from platform_shared.services.discord.permissions import PERMISSION_LABELS

_CHANNEL = "700000000000000001"
_MESSAGE = "710000000000000001"
_ROUTE = f"/channels/{_CHANNEL}/messages/pins/{_MESSAGE}"


class _Recorder:
    """Answers every request with *status* (and *reply* as its body) and keeps each one's method and route."""

    def __init__(self, reply: Any = None, *, status: int = 204) -> None:
        self.reply = reply
        self.status = status
        self.requests: list[tuple[str, str, bytes]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/api/v10")
        self.requests.append((request.method, path, request.content))
        if self.reply is None:
            return httpx.Response(self.status)
        return httpx.Response(self.status, json=self.reply)


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> DiscordRestClient:
    async def _no_sleep(_seconds: float) -> None:
        return None

    return DiscordRestClient("token", transport=httpx.MockTransport(handler), sleep=_no_sleep)


def test_the_client_has_the_mixin() -> None:
    assert issubclass(DiscordRestClient, MessagePins)


def test_pin_messages_is_bit_51_with_its_label() -> None:
    assert PIN_MESSAGES == 1 << 51
    assert PERMISSION_LABELS[PIN_MESSAGES] == "Pin Messages"
    assert permission_labels([PIN_MESSAGES]) == ["Pin Messages"]


@pytest.mark.anyio
async def test_pin_puts_the_message_on_the_new_route() -> None:
    recorder = _Recorder()
    async with _client(recorder) as client:
        assert await client.pin_message(_CHANNEL, _MESSAGE) is None
    assert recorder.requests == [("PUT", _ROUTE, b"")]


@pytest.mark.anyio
async def test_unpin_deletes_the_message_on_the_same_route() -> None:
    recorder = _Recorder()
    async with _client(recorder) as client:
        assert await client.unpin_message(_CHANNEL, _MESSAGE) is None
    assert recorder.requests == [("DELETE", _ROUTE, b"")]


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("status", "code"),
    [(403, MISSING_PERMISSIONS), (400, MAX_PINS), (404, UNKNOWN_MESSAGE)],
    ids=["no-pin-messages", "pin-list-full", "message-gone"],
)
async def test_a_refusal_raises_with_discords_code(status: int, code: int) -> None:
    recorder = _Recorder({"code": code, "message": "refused"}, status=status)
    async with _client(recorder) as client:
        with pytest.raises(DiscordApiError) as caught:
            await client.pin_message(_CHANNEL, _MESSAGE)
    assert (caught.value.status, caught.value.code) == (status, code)
    assert MAX_PINS == 30003
