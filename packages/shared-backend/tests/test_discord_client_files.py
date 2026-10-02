"""Unit tests for platform_shared.services.discord.client_files — files on an interaction's reply.

Offline, through ``httpx.MockTransport`` (as ``test_discord_client.py``): the
route, the multipart parts (``payload_json`` with its ``attachments`` and safe
``allowed_mentions``, one ``files[n]`` per file), a 429 retry's body, and a
refusal's Discord code.
"""
import dataclasses
import json
import re
from collections.abc import Callable

import httpx
import pytest

from platform_shared.services.discord import (
    MISSING_PERMISSIONS,
    DiscordApiError,
    DiscordFile,
    DiscordRestClient,
    InteractionFiles,
)

_APP = "900000000000000001"
_TOKEN = "interaction-token"
_PATH = f"/webhooks/{_APP}/{_TOKEN}/messages/@original"
_CSV = "﻿name,note\r\nJaina,=1+1\r\n".encode()

# One multipart part: (filename or None, its Content-Type or None, its bytes).
Part = tuple[str | None, str | None, bytes]


def _parts(request: httpx.Request) -> dict[str, Part]:
    """The multipart body's parts by name."""
    boundary = request.headers["content-type"].split("boundary=", 1)[1].encode()
    parts: dict[str, Part] = {}
    for chunk in request.content.split(b"--" + boundary)[1:-1]:
        head, _, body = chunk.removeprefix(b"\r\n").partition(b"\r\n\r\n")
        headers = dict(line.split(": ", 1) for line in head.decode().split("\r\n"))
        disposition = headers["Content-Disposition"]
        name = re.search(r'; name="([^"]*)"', disposition)
        filename = re.search(r'; filename="([^"]*)"', disposition)
        assert name is not None
        parts[name.group(1)] = (filename and filename.group(1), headers.get("Content-Type"), body.removesuffix(b"\r\n"))
    return parts


def _client(
    handler: Callable[[httpx.Request], httpx.Response], slept: list[float] | None = None
) -> DiscordRestClient:
    async def _sleep(seconds: float) -> None:
        if slept is not None:
            slept.append(seconds)

    return DiscordRestClient("token", transport=httpx.MockTransport(handler), sleep=_sleep)


def _files() -> list[DiscordFile]:
    return [DiscordFile("attendance-2001-01-01.csv", _CSV), DiscordFile("notes.txt", b"hi", "text/plain")]


def test_the_client_has_the_mixin() -> None:
    assert issubclass(DiscordRestClient, InteractionFiles)


def test_a_file_defaults_to_csv_and_is_frozen() -> None:
    file = DiscordFile("raid.csv", b"a")
    assert file.content_type == "text/csv; charset=utf-8"
    with pytest.raises(dataclasses.FrozenInstanceError):
        file.filename = "other.csv"  # type: ignore[misc]


@pytest.mark.anyio
async def test_files_go_up_as_multipart_on_the_original_response() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "1", "attachments": [{"id": "5"}]})

    async with _client(handler) as client:
        message = await client.edit_original_interaction_response_with_files(
            _APP, _TOKEN, {"content": "Here it is."}, _files()
        )

    assert message == {"id": "1", "attachments": [{"id": "5"}]}
    [request] = requests
    assert (request.method, request.url.path.removeprefix("/api/v10")) == ("PATCH", _PATH)
    assert request.headers["content-type"].startswith("multipart/form-data; boundary=")
    parts = _parts(request)
    assert list(parts) == ["payload_json", "files[0]", "files[1]"]
    filename, content_type, body = parts["payload_json"]
    assert filename is None
    assert json.loads(body) == {
        "content": "Here it is.",
        "allowed_mentions": {"parse": []},
        "attachments": [
            {"id": 0, "filename": "attendance-2001-01-01.csv"},
            {"id": 1, "filename": "notes.txt"},
        ],
    }
    assert parts["files[0]"] == ("attendance-2001-01-01.csv", "text/csv; charset=utf-8", _CSV)
    assert parts["files[1]"] == ("notes.txt", "text/plain", b"hi")


@pytest.mark.anyio
async def test_the_callers_allowed_mentions_are_kept() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"id": "1"})

    mentions = {"parse": [], "users": ["42"]}
    async with _client(handler) as client:
        await client.edit_original_interaction_response_with_files(
            _APP, _TOKEN, {"content": "<@42>", "allowed_mentions": mentions}, _files()[:1]
        )

    payload = json.loads(_parts(requests[0])["payload_json"][2])
    assert payload["allowed_mentions"] == mentions


@pytest.mark.anyio
async def test_a_429_sends_the_same_parts_again() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(429, json={"retry_after": 0.25, "global": False})
        return httpx.Response(200, json={"id": "1"})

    slept: list[float] = []
    async with _client(handler, slept) as client:
        message = await client.edit_original_interaction_response_with_files(
            _APP, _TOKEN, {"content": "Here it is."}, _files()
        )

    assert message == {"id": "1"}
    assert slept == [0.25]
    assert len(requests) == 2
    assert _parts(requests[1]) == _parts(requests[0])
    assert _parts(requests[1])["files[0]"][2] == _CSV


@pytest.mark.anyio
async def test_a_missing_permission_raises_with_its_code() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"code": MISSING_PERMISSIONS, "message": "Missing Permissions"})

    async with _client(handler) as client:
        with pytest.raises(DiscordApiError) as caught:
            await client.edit_original_interaction_response_with_files(
                _APP, _TOKEN, {"content": "Here it is."}, _files()
            )

    assert (caught.value.status, caught.value.code, caught.value.message) == (
        403,
        MISSING_PERMISSIONS,
        "Missing Permissions",
    )
