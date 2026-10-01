"""Unit tests for platform_shared.services.discord.emojis.

Sync is driven through the real ``DiscordRestClient`` over an
``httpx.MockTransport`` fake of the application-emoji endpoints, so the
assertions cover exactly what is uploaded and deleted.
"""
import asyncio
import json
import struct
import zlib
from pathlib import Path
from typing import Any

import httpx
import pytest

from platform_shared.services.discord.client import DiscordApiError, DiscordRestClient
from platform_shared.services.discord.emojis import (
    EMPTY_EMOJIS,
    MAX_IMAGE_BYTES,
    EmojiAsset,
    EmojiRegistry,
    EmojiSet,
    expected_names,
    load_assets,
    missing_expected,
    resolve_emoji_set,
    split_emoji_name,
    stale_versions,
    sync_application_emojis,
    validate_logical_name,
)

_APP_ID = "app-123"
_EMOJIS_PATH = f"/api/v10/applications/{_APP_ID}/emojis"


def _png(seed: int) -> bytes:
    """A real 1x1 PNG whose pixel depends on ``seed`` (distinct hashes)."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    pixel = zlib.compress(bytes([0, seed % 256, 0, 0, 255]))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", pixel) + chunk(b"IEND", b"")


def _asset(logical: str, seed: int) -> EmojiAsset:
    return EmojiAsset(logical, _png(seed))


def _remote(name: str, emoji_id: str) -> dict[str, Any]:
    return {"id": emoji_id, "name": name, "animated": False, "available": True}


class _FakeEmojiApi:
    """Fake of the application-emoji endpoints that records every write."""

    def __init__(self, existing: list[dict[str, Any]], *, refuse: set[str] | None = None) -> None:
        self.emojis = list(existing)
        self.refuse = refuse or set()
        self.created: list[str] = []
        self.deleted: list[str] = []
        self._next_id = 2_000_000_000_000_000_000

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.path == _EMOJIS_PATH:
            return httpx.Response(200, json={"items": self.emojis})
        if request.method == "POST" and request.url.path == _EMOJIS_PATH:
            body = json.loads(request.content)
            assert body["image"].startswith("data:image/png;base64,")
            if body["name"] in self.refuse:
                return httpx.Response(400, json={"code": 50035, "message": "Invalid Form Body"})
            self._next_id += 1
            created = _remote(body["name"], str(self._next_id))
            self.emojis.append(created)
            self.created.append(body["name"])
            return httpx.Response(201, json=created)
        if request.method == "DELETE" and request.url.path.startswith(_EMOJIS_PATH + "/"):
            emoji_id = request.url.path.rsplit("/", 1)[1]
            self.deleted.append(emoji_id)
            self.emojis = [emoji for emoji in self.emojis if emoji["id"] != emoji_id]
            return httpx.Response(204)
        return httpx.Response(404, json={"code": 0, "message": "404: Not Found"})


async def _no_sleep(_: float) -> None:
    return None


def _client(api: _FakeEmojiApi) -> DiscordRestClient:
    return DiscordRestClient("Bot-Secret-Token", transport=httpx.MockTransport(api.handler), sleep=_no_sleep)


# ---------------------------------------------------------------------------
# Names + assets
# ---------------------------------------------------------------------------


class TestNames:
    def test_versioned_name_is_stem_plus_six_hex_of_the_image_hash(self) -> None:
        asset = _asset("warrior", 1)
        logical, version = split_emoji_name(asset.emoji_name)
        assert logical == "warrior"
        assert version is not None and len(version) == 6
        assert asset.emoji_name == f"warrior__{version}"

    def test_changing_the_art_changes_the_name(self) -> None:
        assert _asset("warrior", 1).emoji_name != _asset("warrior", 2).emoji_name

    def test_unversioned_names_split_to_themselves(self) -> None:
        assert split_emoji_name("Warrior") == ("Warrior", None)
        assert split_emoji_name("warrior__xyz") == ("warrior__xyz", None)

    @pytest.mark.parametrize("bad", ["Warrior", "war__rior", "_war", "war_", "w", "a" * 25, "war-rior"])
    def test_rejects_names_that_cannot_carry_a_version(self, bad: str) -> None:
        with pytest.raises(ValueError):
            validate_logical_name(bad)

    def test_longest_allowed_name_fits_discords_32_char_limit(self) -> None:
        asset = _asset("a" * 24, 1)
        validate_logical_name(asset.logical_name)
        assert len(asset.emoji_name) == 32

    def test_data_uri(self) -> None:
        assert _asset("mage", 1).data_uri().startswith("data:image/png;base64,iVBOR")


class TestLoadAssets:
    def test_loads_pngs_by_stem(self, tmp_path: Path) -> None:
        (tmp_path / "mage.png").write_bytes(_png(1))
        (tmp_path / "role_tank.png").write_bytes(_png(2))
        (tmp_path / "NOTICE.md").write_text("credits")
        assets = load_assets(tmp_path)
        assert sorted(assets) == ["mage", "role_tank"]
        assert assets["mage"].image == _png(1)

    def test_rejects_a_bad_name(self, tmp_path: Path) -> None:
        (tmp_path / "Mage.png").write_bytes(_png(1))
        with pytest.raises(ValueError, match="lowercase"):
            load_assets(tmp_path)

    def test_rejects_a_non_png(self, tmp_path: Path) -> None:
        (tmp_path / "mage.png").write_bytes(b"GIF89a....")
        with pytest.raises(ValueError, match="not a PNG"):
            load_assets(tmp_path)

    def test_rejects_an_oversized_image(self, tmp_path: Path) -> None:
        (tmp_path / "mage.png").write_bytes(_png(1) + b"\0" * MAX_IMAGE_BYTES)
        with pytest.raises(ValueError, match="bytes"):
            load_assets(tmp_path)


# ---------------------------------------------------------------------------
# EmojiSet
# ---------------------------------------------------------------------------


class TestEmojiSet:
    def test_markup_and_component_for_an_uploaded_emoji(self) -> None:
        emojis = resolve_emoji_set([_remote("mage__abc123", "111")])
        assert emojis.has("mage")
        assert emojis.markup("mage", "[MAG]") == "<:mage__abc123:111>"
        assert emojis.component("mage", "🔥") == {"id": "111", "name": "mage__abc123"}

    def test_fallbacks_when_missing(self) -> None:
        assert EMPTY_EMOJIS.markup("mage", "[MAG]") == "[MAG]"
        assert EMPTY_EMOJIS.markup("mage") == ""
        assert EMPTY_EMOJIS.component("mage", "🔥") == {"name": "🔥"}
        assert EMPTY_EMOJIS.component("mage") is None

    def test_prefers_the_current_version_over_a_newer_upload(self) -> None:
        remote = [_remote("mage__aaaaaa", "100"), _remote("mage__bbbbbb", "200")]
        emojis = resolve_emoji_set(remote, {"mage": "mage__aaaaaa"})
        assert emojis.markup("mage") == "<:mage__aaaaaa:100>"

    def test_uses_the_newest_version_until_the_current_one_is_uploaded(self) -> None:
        remote = [_remote("mage__aaaaaa", "100"), _remote("mage__bbbbbb", "200")]
        emojis = resolve_emoji_set(remote, {"mage": "mage__cccccc"})
        assert emojis.markup("mage") == "<:mage__bbbbbb:200>"
        assert missing_expected(emojis, {"mage": "mage__cccccc"}) == ["mage"]

    def test_unversioned_emojis_resolve_under_their_own_name_and_junk_is_skipped(self) -> None:
        emojis = resolve_emoji_set([_remote("Custom", "300"), {"name": "", "id": "1"}, {"name": "x", "id": None}])
        assert emojis.markup("Custom") == "<:Custom:300>"
        assert set(emojis.by_logical) == {"Custom"}


# ---------------------------------------------------------------------------
# Pruning + sync
# ---------------------------------------------------------------------------


class TestStaleVersions:
    def test_keeps_the_current_art_and_the_newest_older_version(self) -> None:
        asset = _asset("mage", 1)
        remote = [
            _remote("mage__000001", "100"),
            _remote("mage__000002", "200"),
            _remote(asset.emoji_name, "50"),
            _remote("mage__000003", "300"),
        ]
        stale = stale_versions(remote, {"mage": asset})
        assert sorted(emoji["id"] for emoji in stale) == ["100", "200"]

    def test_keeps_two_older_versions_when_the_current_one_is_missing(self) -> None:
        remote = [_remote("mage__000001", "100"), _remote("mage__000002", "200"), _remote("mage__000003", "300")]
        stale = stale_versions(remote, {"mage": _asset("mage", 1)})
        assert [emoji["id"] for emoji in stale] == ["100"]

    def test_never_touches_unversioned_or_unknown_emojis(self) -> None:
        remote = [
            _remote("Custom", "1"),
            _remote("retired__000001", "2"),
            _remote("retired__000002", "3"),
            _remote("retired__000003", "4"),
        ]
        assert stale_versions(remote, {"mage": _asset("mage", 1)}) == []


class TestSync:
    async def test_uploads_missing_art_and_leaves_current_art_alone(self) -> None:
        mage, rogue = _asset("mage", 1), _asset("rogue", 2)
        api = _FakeEmojiApi([_remote(mage.emoji_name, "100")])
        async with _client(api) as client:
            report = await sync_application_emojis(client, _APP_ID, {"mage": mage, "rogue": rogue})
        assert api.created == [rogue.emoji_name]
        assert report.uploaded == (rogue.emoji_name,)
        assert report.unchanged == (mage.emoji_name,)
        assert report.ok

    async def test_new_art_uploads_a_new_version_and_prunes_beyond_two(self) -> None:
        mage = _asset("mage", 9)
        api = _FakeEmojiApi([_remote("mage__000001", "100"), _remote("mage__000002", "200")])
        async with _client(api) as client:
            report = await sync_application_emojis(client, _APP_ID, {"mage": mage})
        assert api.created == [mage.emoji_name]
        assert api.deleted == ["100"]
        assert report.pruned == ("mage__000001",)
        assert sorted(emoji["name"] for emoji in api.emojis) == sorted(["mage__000002", mage.emoji_name])

    async def test_a_refused_upload_is_reported_and_the_rest_continue(self) -> None:
        mage, rogue = _asset("mage", 1), _asset("rogue", 2)
        api = _FakeEmojiApi([], refuse={mage.emoji_name})
        async with _client(api) as client:
            report = await sync_application_emojis(client, _APP_ID, {"mage": mage, "rogue": rogue})
        assert api.created == [rogue.emoji_name]
        assert not report.ok
        assert report.failed[0][0] == mage.emoji_name
        assert "code=50035" in report.failed[0][1]

    async def test_dry_run_writes_nothing(self) -> None:
        mage = _asset("mage", 9)
        api = _FakeEmojiApi([_remote("mage__000001", "100"), _remote("mage__000002", "200")])
        async with _client(api) as client:
            report = await sync_application_emojis(client, _APP_ID, {"mage": mage}, dry_run=True)
        assert api.created == [] and api.deleted == []
        assert report.uploaded == (mage.emoji_name,)
        assert report.pruned == ("mage__000001",)

    async def test_a_failed_listing_raises_before_any_write(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.method == "GET"
            return httpx.Response(401, json={"code": 0, "message": "401: Unauthorized"})

        client = DiscordRestClient("t", transport=httpx.MockTransport(handler), sleep=_no_sleep)
        async with client:
            with pytest.raises(DiscordApiError):
                await sync_application_emojis(client, _APP_ID, {"mage": _asset("mage", 1)})


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class TestRegistry:
    def test_serves_the_empty_set_without_an_event_loop(self) -> None:
        async def fetch() -> list[dict[str, Any]]:
            raise AssertionError("must not fetch without a running loop")

        registry = EmojiRegistry(fetch)
        assert registry.current() is EMPTY_EMOJIS

    async def test_current_starts_one_background_refresh(self) -> None:
        calls = 0
        release = asyncio.Event()

        async def fetch() -> list[dict[str, Any]]:
            nonlocal calls
            calls += 1
            await release.wait()
            return [_remote("mage__abc123", "1")]

        registry = EmojiRegistry(fetch)
        assert registry.current() is EMPTY_EMOJIS
        assert registry.current() is EMPTY_EMOJIS  # refresh already in flight
        release.set()
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        assert calls == 1
        assert registry.current().markup("mage") == "<:mage__abc123:1>"

    async def test_refreshes_after_the_ttl_once_complete(self) -> None:
        clock = _Clock()
        mage = _asset("mage", 1)

        async def fetch() -> list[dict[str, Any]]:
            return [_remote(mage.emoji_name, "1")]

        registry = EmojiRegistry(fetch, expected=expected_names({"mage": mage}), ttl_s=600, retry_s=60, clock=clock)
        await registry.refresh()
        clock.now += 599
        assert not registry.is_stale
        clock.now += 1
        assert registry.is_stale

    async def test_rechecks_soon_while_current_art_is_missing(self) -> None:
        clock = _Clock()

        async def fetch() -> list[dict[str, Any]]:
            return [_remote("mage__000001", "1")]

        registry = EmojiRegistry(fetch, expected={"mage": "mage__abcdef"}, ttl_s=600, retry_s=60, clock=clock)
        emojis = await registry.refresh()
        assert emojis.markup("mage") == "<:mage__000001:1>"  # old art until the sync lands
        clock.now += 60
        assert registry.is_stale

    @pytest.mark.parametrize(
        "error",
        [DiscordApiError(500, None, "boom"), httpx.ConnectError("down"), TimeoutError(), RuntimeError("bug")],
    )
    async def test_a_failed_refresh_keeps_the_last_good_set(self, error: Exception) -> None:
        clock = _Clock()
        results: list[Any] = [[_remote("mage__abc123", "1")], error]

        async def fetch() -> list[dict[str, Any]]:
            result = results.pop(0)
            if isinstance(result, Exception):
                raise result
            return result

        registry = EmojiRegistry(fetch, ttl_s=600, retry_s=60, clock=clock)
        good = await registry.refresh()
        clock.now += 600
        assert await registry.refresh() is good
        clock.now += 59
        assert not registry.is_stale
        clock.now += 1
        assert registry.is_stale

    def test_empty_set_type(self) -> None:
        assert isinstance(EMPTY_EMOJIS, EmojiSet)
