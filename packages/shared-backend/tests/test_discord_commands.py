"""Unit tests for platform_shared.services.discord.commands (+ list_global_commands).

Enabling Activities makes Discord auto-create a PRIMARY_ENTRY_POINT command,
and a bulk overwrite that omits it is rejected. These tests drive the real
``DiscordRestClient`` over an ``httpx.MockTransport`` fake of the two global
command endpoints and assert exactly what is PUT in both cases:

  - an entry point is registered  → it is carried (fields preserved, id kept,
    response-only metadata dropped)
  - none is registered            → the caller's list is sent unchanged
"""
import copy
import json
from typing import Any

import httpx
import pytest

from platform_shared.services.discord.client import DiscordApiError, DiscordRestClient
from platform_shared.services.discord.commands import (
    COMMAND_TYPE_PRIMARY_ENTRY_POINT,
    entry_points_to_carry,
    is_entry_point_command,
    overwrite_global_commands_preserving_entry_point,
)

_APP_ID = "app-123"
_COMMANDS_PATH = f"/api/v10/applications/{_APP_ID}/commands"

# What GET /applications/{id}/commands?with_localizations=true returns for the
# command Discord creates when Activities is enabled.
_FETCHED_ENTRY_POINT: dict[str, Any] = {
    "id": "1300000000000000004",
    "application_id": _APP_ID,
    "version": "1300000000000000099",
    "default_member_permissions": None,
    "type": COMMAND_TYPE_PRIMARY_ENTRY_POINT,
    "name": "launch",
    "name_localizations": {"de": "starten"},
    "description": "Launch MyGamingAssistant",
    "description_localizations": None,
    "dm_permission": True,
    "contexts": [0, 1, 2],
    "integration_types": [0, 1],
    "nsfw": False,
    "handler": 2,
}

_FETCHED_SLASH_COMMAND: dict[str, Any] = {
    "id": "1300000000000000001",
    "application_id": _APP_ID,
    "version": "1300000000000000050",
    "type": 1,
    "name": "old-command",
    "description": "A command the new deploy no longer declares",
}

_DESIRED: list[dict[str, Any]] = [
    {"name": "raid", "description": "Raid signups", "type": 1, "contexts": [0]},
    {"name": "raid-admin", "description": "Organise raids", "type": 1, "contexts": [0]},
]


class _FakeCommandsApi:
    """Fake of GET + PUT /applications/{id}/commands that records every call."""

    def __init__(self, registered: list[dict[str, Any]], *, list_status: int = 200) -> None:
        self.registered = registered
        self.list_status = list_status
        self.calls: list[tuple[str, str, dict[str, str]]] = []
        self.put_body: list[dict[str, Any]] | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append((request.method, request.url.path, dict(request.url.params)))
        if request.url.path != _COMMANDS_PATH:
            return httpx.Response(404, json={"code": 0, "message": "404: Not Found"})
        if request.method == "GET":
            if self.list_status != 200:
                return httpx.Response(
                    self.list_status, json={"code": 50001, "message": "Missing Access"},
                )
            return httpx.Response(200, json=self.registered)
        if request.method == "PUT":
            self.put_body = json.loads(request.content)
            echoed = [
                {"id": cmd.get("id", f"new-{i}"), "application_id": _APP_ID, **cmd}
                for i, cmd in enumerate(self.put_body or [])
            ]
            return httpx.Response(200, json=echoed)
        return httpx.Response(405, json={"code": 0, "message": "405: Method Not Allowed"})


def _client(api: _FakeCommandsApi) -> DiscordRestClient:
    async def _no_sleep(_seconds: float) -> None:
        return None

    return DiscordRestClient(
        "Bot-Secret-Token", transport=httpx.MockTransport(api.handler), sleep=_no_sleep,
    )


class TestListGlobalCommands:
    @pytest.mark.anyio
    async def test_requests_full_localizations_by_default(self) -> None:
        api = _FakeCommandsApi([_FETCHED_ENTRY_POINT])
        async with _client(api) as client:
            result = await client.list_global_commands(_APP_ID)

        assert result == [_FETCHED_ENTRY_POINT]
        assert api.calls == [("GET", _COMMANDS_PATH, {"with_localizations": "true"})]

    @pytest.mark.anyio
    async def test_can_skip_localizations(self) -> None:
        api = _FakeCommandsApi([])
        async with _client(api) as client:
            result = await client.list_global_commands(_APP_ID, with_localizations=False)

        assert result == []
        assert api.calls == [("GET", _COMMANDS_PATH, {})]


class TestOverwritePreservingEntryPoint:
    @pytest.mark.anyio
    async def test_existing_entry_point_is_carried_with_its_fields(self) -> None:
        api = _FakeCommandsApi([_FETCHED_SLASH_COMMAND, _FETCHED_ENTRY_POINT])
        async with _client(api) as client:
            registered = await overwrite_global_commands_preserving_entry_point(
                client, _APP_ID, _DESIRED,
            )

        assert [call[0] for call in api.calls] == ["GET", "PUT"]
        expected_entry_point = {
            key: value
            for key, value in _FETCHED_ENTRY_POINT.items()
            if key not in {"application_id", "version"}
        }
        # The stale slash command is dropped (that's what an overwrite is for);
        # the entry point rides along unchanged — same id, handler, contexts,
        # localizations — so Discord updates it in place.
        assert api.put_body == [*_DESIRED, expected_entry_point]
        assert [cmd["name"] for cmd in registered] == ["raid", "raid-admin", "launch"]

    @pytest.mark.anyio
    async def test_no_entry_point_sends_the_desired_list_unchanged(self) -> None:
        api = _FakeCommandsApi([_FETCHED_SLASH_COMMAND])
        async with _client(api) as client:
            registered = await overwrite_global_commands_preserving_entry_point(
                client, _APP_ID, _DESIRED,
            )

        assert [call[0] for call in api.calls] == ["GET", "PUT"]
        assert api.put_body == _DESIRED
        assert not any(cmd.get("type") == COMMAND_TYPE_PRIMARY_ENTRY_POINT for cmd in registered)

    @pytest.mark.anyio
    async def test_empty_registration_sends_the_desired_list_unchanged(self) -> None:
        api = _FakeCommandsApi([])
        async with _client(api) as client:
            await overwrite_global_commands_preserving_entry_point(client, _APP_ID, _DESIRED)

        assert api.put_body == _DESIRED

    @pytest.mark.anyio
    async def test_caller_declared_entry_point_is_not_duplicated(self) -> None:
        own_entry_point = {
            "name": "play",
            "description": "Open the Activity",
            "type": COMMAND_TYPE_PRIMARY_ENTRY_POINT,
            "handler": 2,
        }
        api = _FakeCommandsApi([_FETCHED_ENTRY_POINT])
        async with _client(api) as client:
            await overwrite_global_commands_preserving_entry_point(
                client, _APP_ID, [*_DESIRED, own_entry_point],
            )

        assert api.put_body == [*_DESIRED, own_entry_point]

    @pytest.mark.anyio
    async def test_failed_listing_aborts_before_any_write(self) -> None:
        api = _FakeCommandsApi([_FETCHED_ENTRY_POINT], list_status=403)
        async with _client(api) as client:
            with pytest.raises(DiscordApiError) as exc_info:
                await overwrite_global_commands_preserving_entry_point(
                    client, _APP_ID, _DESIRED,
                )

        assert exc_info.value.status == 403
        assert exc_info.value.code == 50001
        assert [call[0] for call in api.calls] == ["GET"]
        assert api.put_body is None


class TestEntryPointsToCarry:
    def test_drops_response_only_fields_and_keeps_the_rest(self) -> None:
        fetched = {
            **_FETCHED_ENTRY_POINT,
            "guild_id": "should-not-be-sent",
            "name_localized": "starten",
            "description_localized": "Starten",
        }
        [carried] = entry_points_to_carry(_DESIRED, [fetched])

        for dropped in ("application_id", "guild_id", "version", "name_localized", "description_localized"):
            assert dropped not in carried
        for kept in ("id", "type", "name", "name_localizations", "description", "contexts",
                     "integration_types", "dm_permission", "nsfw", "handler",
                     "default_member_permissions", "description_localizations"):
            assert carried[kept] == _FETCHED_ENTRY_POINT[kept]

    def test_does_not_mutate_inputs(self) -> None:
        desired = copy.deepcopy(_DESIRED)
        existing = [copy.deepcopy(_FETCHED_ENTRY_POINT)]

        entry_points_to_carry(desired, existing)

        assert desired == _DESIRED
        assert existing == [_FETCHED_ENTRY_POINT]

    def test_is_entry_point_command(self) -> None:
        assert is_entry_point_command(_FETCHED_ENTRY_POINT)
        assert not is_entry_point_command(_FETCHED_SLASH_COMMAND)
        assert not is_entry_point_command({"name": "untyped"})
