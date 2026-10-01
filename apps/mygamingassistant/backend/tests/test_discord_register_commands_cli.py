"""``python -m app.cli discord-register-commands`` — global path vs. Activities.

Enabling Activities in the Developer Portal makes Discord create a
PRIMARY_ENTRY_POINT ("Launch") command and reject any bulk overwrite that
omits it. This command runs on every deploy (app.yaml post_deploy_commands),
so it must keep the entry point when one exists and never invent one.

``DiscordRestClient`` is swapped for the real client wired to an
``httpx.MockTransport`` fake of Discord's global-commands endpoints — the CLI
code path is exercised end to end, offline.
"""
from __future__ import annotations

import json
import sys
from typing import Any

import httpx
import pytest

import platform_shared.services.discord.client as discord_client_module
from app.core.config import settings
from app.services.discord.commands_spec import ALL_COMMANDS

_APP_ID = "1234567890"
_COMMANDS_PATH = f"/api/v10/applications/{_APP_ID}/commands"

_ENTRY_POINT: dict[str, Any] = {
    "id": "1400000000000000004",
    "application_id": _APP_ID,
    "version": "1400000000000000077",
    "type": 4,
    "name": "launch",
    "description": "",
    "name_localizations": None,
    "description_localizations": None,
    "contexts": [0, 1, 2],
    "integration_types": [0, 1],
    "dm_permission": True,
    "default_member_permissions": None,
    "nsfw": False,
    "handler": 2,
}


class _FakeDiscord:
    def __init__(self, registered: list[dict[str, Any]], *, put_status: int = 200) -> None:
        self.registered = registered
        self.put_status = put_status
        self.methods: list[str] = []
        self.put_body: list[dict[str, Any]] | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.url.path == _COMMANDS_PATH, request.url.path
        self.methods.append(request.method)
        if request.method == "GET":
            return httpx.Response(200, json=self.registered)
        self.put_body = json.loads(request.content)
        if self.put_status != 200:
            return httpx.Response(
                self.put_status,
                json={
                    "code": 50240,
                    "message": "You cannot remove this app's Entry Point command in a bulk update operation.",
                },
            )
        return httpx.Response(
            200,
            json=[{"id": cmd.get("id", f"new-{i}"), **cmd} for i, cmd in enumerate(self.put_body)],
        )


@pytest.fixture
def fake_discord(monkeypatch: pytest.MonkeyPatch):
    """Configure Discord settings + route the CLI's REST client to a fake."""
    monkeypatch.setattr(settings, "discord_enabled", True)
    monkeypatch.setattr(settings, "discord_application_id", _APP_ID)
    monkeypatch.setattr(settings, "discord_bot_token", "test-bot-token")
    monkeypatch.setattr(settings, "discord_dev_guild_id", "")
    monkeypatch.setattr(sys, "argv", ["app.cli", "discord-register-commands"])

    real_client = discord_client_module.DiscordRestClient

    def _install(api: _FakeDiscord) -> _FakeDiscord:
        def _factory(bot_token: str, **_kwargs: Any) -> discord_client_module.DiscordRestClient:
            return real_client(bot_token, transport=httpx.MockTransport(api.handler))

        monkeypatch.setattr(discord_client_module, "DiscordRestClient", _factory)
        return api

    return _install


def test_global_registration_keeps_an_existing_entry_point(
    fake_discord, capsys: pytest.CaptureFixture[str],
) -> None:
    api = fake_discord(_FakeDiscord([_ENTRY_POINT]))

    from app.cli import _run_discord_register_commands

    assert _run_discord_register_commands() == 0
    assert api.methods == ["GET", "PUT"]
    assert api.put_body is not None
    assert api.put_body[: len(ALL_COMMANDS)] == ALL_COMMANDS
    [carried] = api.put_body[len(ALL_COMMANDS):]
    assert carried == {
        key: value
        for key, value in _ENTRY_POINT.items()
        if key not in {"application_id", "version"}
    }
    out = capsys.readouterr().out
    assert "/launch (id=1400000000000000004) — Activity entry point, kept" in out


def test_global_registration_without_entry_point_adds_none(
    fake_discord, capsys: pytest.CaptureFixture[str],
) -> None:
    api = fake_discord(_FakeDiscord([]))

    from app.cli import _run_discord_register_commands

    assert _run_discord_register_commands() == 0
    assert api.methods == ["GET", "PUT"]
    assert api.put_body == ALL_COMMANDS
    assert "entry point" not in capsys.readouterr().out


def test_discord_rejection_exits_1_with_the_error_code(
    fake_discord, capsys: pytest.CaptureFixture[str],
) -> None:
    fake_discord(_FakeDiscord([], put_status=400))

    from app.cli import _run_discord_register_commands

    assert _run_discord_register_commands() == 1
    out = capsys.readouterr().out
    assert "status=400 code=50240" in out
    assert "Re-run" in out
    assert "test-bot-token" not in out
