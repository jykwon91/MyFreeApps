"""``python -m app.cli discord-sync-emojis`` — uploads the raid bot's icons.

Runs on every deploy (app.yaml post_deploy_commands), so it must be a no-op
for an unconfigured bot, idempotent when the art hasn't changed, and loud
(exit 1) when Discord refuses something.

``DiscordRestClient`` is swapped for the real client wired to an
``httpx.MockTransport`` fake of Discord's application-emoji endpoints, and the
art directory for a few tiny PNGs — the CLI code path runs end to end, offline.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest

import platform_shared.services.discord.client as discord_client_module
from app.core.config import settings
from app.services.discord import emojis as discord_emojis

_APP_ID = "1234567890"
_EMOJIS_PATH = f"/api/v10/applications/{_APP_ID}/emojis"
_PNG = b"\x89PNG\r\n\x1a\n"


class _FakeEmojiApi:
    """Discord's application-emoji endpoints over an in-memory list."""

    def __init__(
        self,
        emojis: list[dict[str, str]] | None = None,
        *,
        list_status: int = 200,
        refuse: frozenset[str] = frozenset(),
    ) -> None:
        self.emojis = list(emojis or [])
        self.list_status = list_status
        self.refuse = refuse
        self.calls: list[str] = []
        self._next_id = 1400000000000000100

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.calls.append(request.method)
        if request.method == "GET" and path == _EMOJIS_PATH:
            if self.list_status != 200:
                return httpx.Response(self.list_status, json={"code": 0, "message": "401: Unauthorized"})
            return httpx.Response(200, json={"items": self.emojis})
        if request.method == "POST" and path == _EMOJIS_PATH:
            body = json.loads(request.content)
            assert body["image"].startswith("data:image/png;base64,")
            if body["name"] in self.refuse:
                return httpx.Response(400, json={"code": 50035, "message": "Invalid Form Body"})
            emoji = {"id": str(self._next_id), "name": body["name"]}
            self._next_id += 1
            self.emojis.append(emoji)
            return httpx.Response(201, json=emoji)
        if request.method == "DELETE" and path.startswith(f"{_EMOJIS_PATH}/"):
            emoji_id = path.rsplit("/", 1)[1]
            self.emojis = [emoji for emoji in self.emojis if emoji["id"] != emoji_id]
            return httpx.Response(204)
        raise AssertionError(f"unexpected {request.method} {path}")

    def names(self) -> list[str]:
        return sorted(emoji["name"] for emoji in self.emojis)


@pytest.fixture
def art_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Two icons standing in for backend/data/discord_emojis."""
    (tmp_path / "warrior.png").write_bytes(_PNG + b"warrior-v1")
    (tmp_path / "status_signed.png").write_bytes(_PNG + b"signed-v1")
    monkeypatch.setattr(discord_emojis, "EMOJI_DIR", tmp_path)
    return tmp_path


@pytest.fixture
def run_cli(art_dir: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]):
    """Configure the bot, route its REST client to ``api`` and run the command."""
    monkeypatch.setattr(settings, "discord_enabled", True)
    monkeypatch.setattr(settings, "discord_application_id", _APP_ID)
    monkeypatch.setattr(settings, "discord_bot_token", "test-bot-token")
    real_client = discord_client_module.DiscordRestClient

    def _run(api: _FakeEmojiApi, *args: str) -> tuple[int, str]:
        def _factory(bot_token: str, **_kwargs: Any) -> discord_client_module.DiscordRestClient:
            return real_client(bot_token, transport=httpx.MockTransport(api.handler))

        monkeypatch.setattr(discord_client_module, "DiscordRestClient", _factory)
        monkeypatch.setattr(sys, "argv", ["app.cli", "discord-sync-emojis", *args])
        from app.cli import _run_discord_sync_emojis

        code = _run_discord_sync_emojis()
        return code, capsys.readouterr().out

    return _run


def _current_names(art_dir: Path) -> list[str]:
    from platform_shared.services.discord import expected_names, load_assets

    return sorted(expected_names(load_assets(art_dir)).values())


def test_first_sync_uploads_every_icon_and_a_rerun_uploads_none(run_cli, art_dir: Path) -> None:
    api = _FakeEmojiApi()

    code, out = run_cli(api)
    assert code == 0
    assert api.names() == _current_names(art_dir)
    assert "Done — 2 icon(s): 2 uploaded, 0 already current, 0 old version(s) pruned, 0 failed." in out

    api.calls.clear()
    code, out = run_cli(api)
    assert code == 0
    assert api.calls == ["GET"]
    assert "0 uploaded, 2 already current" in out


def test_changed_art_uploads_a_new_version_and_prunes_beyond_the_previous_one(run_cli, art_dir: Path) -> None:
    api = _FakeEmojiApi()
    run_cli(api)
    first = {name.split("__")[0]: name for name in api.names()}

    (art_dir / "warrior.png").write_bytes(_PNG + b"warrior-v2")
    code, _ = run_cli(api)
    assert code == 0
    second = {name.split("__")[0]: name for name in api.names() if name not in first.values()}
    # The previous warrior version is kept for posts rendered before this deploy.
    assert first["warrior"] in api.names()

    (art_dir / "warrior.png").write_bytes(_PNG + b"warrior-v3")
    code, out = run_cli(api)
    assert code == 0
    assert f"pruned {first['warrior']}" in out
    assert first["warrior"] not in api.names()
    assert second["warrior"] in api.names()
    assert sum(name.startswith("warrior__") for name in api.names()) == 2


def test_dry_run_prints_the_plan_without_writing(run_cli, art_dir: Path) -> None:
    api = _FakeEmojiApi()

    code, out = run_cli(api, "--dry-run")

    assert code == 0
    assert api.calls == ["GET"]
    assert api.emojis == []
    for name in _current_names(art_dir):
        assert f"would upload {name}" in out
    assert out.rstrip().endswith(
        "Dry run — 2 icon(s): 2 would upload, 0 already current, 0 old version(s) to prune, 0 failed."
    )


def test_a_refused_upload_exits_1_but_the_rest_still_sync(run_cli, art_dir: Path) -> None:
    warrior = next(name for name in _current_names(art_dir) if name.startswith("warrior__"))
    api = _FakeEmojiApi(refuse=frozenset({warrior}))

    code, out = run_cli(api)

    assert code == 1
    assert [name.split("__")[0] for name in api.names()] == ["status_signed"]
    assert f"FAILED {warrior}: status=400 code=50035" in out


def test_a_refused_listing_exits_1_before_any_write(run_cli) -> None:
    api = _FakeEmojiApi(list_status=401)

    code, out = run_cli(api)

    assert code == 1
    assert api.calls == ["GET"]
    assert "Discord rejected the emoji listing (status=401 code=0)" in out
    assert "test-bot-token" not in out


def test_an_unknown_argument_exits_1_without_calling_discord(run_cli) -> None:
    api = _FakeEmojiApi()

    code, out = run_cli(api, "--force")

    assert code == 1
    assert api.calls == []
    assert "unknown argument(s) '--force'" in out


def test_missing_credentials_exit_1(run_cli, monkeypatch: pytest.MonkeyPatch) -> None:
    api = _FakeEmojiApi()
    monkeypatch.setattr(settings, "discord_bot_token", "")

    code, out = run_cli(api)

    assert code == 1
    assert api.calls == []
    assert "DISCORD_BOT_TOKEN" in out


def test_a_disabled_bot_is_a_successful_no_op(run_cli, monkeypatch: pytest.MonkeyPatch) -> None:
    api = _FakeEmojiApi()
    monkeypatch.setattr(settings, "discord_enabled", False)

    code, out = run_cli(api)

    assert code == 0
    assert api.calls == []
    assert "skipping emoji sync" in out
