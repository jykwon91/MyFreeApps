"""The raid posts' banners — committed art, URLs, the post's image, the route.

A missing or malformed banner, an uncredited glyph, or a URL that doesn't
change with the art (Discord caches embed images by URL) fails here instead
of on a live post.
"""
from __future__ import annotations

import io
import logging
import re
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from PIL import Image
from platform_shared.services.discord import EMPTY_EMOJIS

from app.api import discord_raid_banners
from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.wow import raid_banners
from app.services.wow.raid_banners import BANNER_DIR, BANNERS, banner_url
from app.services.wow.raid_catalog import RAIDS
from app.services.wow.raid_embed import build_signup_message

_ORIGIN = "https://mga.example"
_CACHE_CURRENT = "public, max-age=31536000, immutable"
_CACHE_OTHER = "public, max-age=3600"


@pytest.fixture
def public_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "frontend_url", f"{_ORIGIN}/")
    monkeypatch.setattr(settings, "backend_root_path", "/api")


def _event(status: str = "scheduled") -> WowRaidEvent:
    return WowRaidEvent(
        id=uuid.uuid4(),
        guild_id=uuid.uuid4(),
        raid_key="onyxia",
        starts_at=datetime(2026, 10, 11, tzinfo=timezone.utc),
        size_cap=40,
        status=status,
        channel_id="c1",
        created_by_user_id="u0",
        created_by_display_name="Thrall",
    )


def _guild() -> WowRaidGuild:
    return WowRaidGuild(id=uuid.uuid4(), discord_guild_id="g1", raid_channel_id="c1", timezone="UTC")


def _post_embed(event: WowRaidEvent) -> dict:
    return build_signup_message(event, [], _guild(), emojis=EMPTY_EMOJIS)["embeds"][0]


async def _get(path: str) -> Response:
    app = FastAPI()
    app.include_router(discord_raid_banners.router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path)


# ---------------------------------------------------------------------------
# The art
# ---------------------------------------------------------------------------


def test_every_raid_has_a_4_to_1_banner() -> None:
    assert set(BANNERS) == {raid.key for raid in RAIDS}
    for banner in BANNERS.values():
        with Image.open(io.BytesIO(banner.png)) as image:
            assert (image.format, image.size) == ("PNG", (1200, 300)), banner.raid_key
        assert re.fullmatch(r"[0-9a-f]{8}", banner.version)


def test_notice_credits_every_banner() -> None:
    notice = (BANNER_DIR / "NOTICE.md").read_text(encoding="utf-8")
    credited = set(re.findall(r"^\| `([a-z0-9_]+)` \|", notice, flags=re.MULTILINE))
    assert credited == set(BANNERS)
    assert "CC BY 3.0" in notice
    assert "SIL Open Font License" in notice


# ---------------------------------------------------------------------------
# URLs and the post
# ---------------------------------------------------------------------------


@pytest.mark.usefixtures("public_origin")
def test_a_banner_url_changes_with_the_art() -> None:
    version = BANNERS["onyxia"].version
    assert banner_url("onyxia") == f"{_ORIGIN}/api/discord/raid-banners/onyxia.png?v={version}"
    assert banner_url("ragefire") is None


def test_no_banners_without_a_public_https_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "frontend_url", "http://localhost:5176")
    assert banner_url("onyxia") is None
    assert "image" not in _post_embed(_event())


@pytest.mark.parametrize(
    ("environment", "level"), [("production", logging.WARNING), ("development", logging.INFO)]
)
def test_startup_says_when_posts_will_lack_banners(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, environment: str, level: int
) -> None:
    monkeypatch.setattr(settings, "frontend_url", "http://localhost:5176")
    monkeypatch.setattr(settings, "environment", environment)
    with caplog.at_level(logging.INFO, logger=raid_banners.__name__):
        raid_banners.log_if_off()
    [record] = caplog.records
    assert record.levelno == level
    assert "FRONTEND_URL is not an https origin" in record.getMessage()


@pytest.mark.usefixtures("public_origin")
def test_startup_is_quiet_when_banners_show(caplog: pytest.LogCaptureFixture) -> None:
    assert raid_banners.banners_off_reason() is None
    with caplog.at_level(logging.INFO, logger=raid_banners.__name__):
        raid_banners.log_if_off()
    assert caplog.records == []


@pytest.mark.usefixtures("public_origin")
@pytest.mark.parametrize("status", ["draft", "scheduled", "completed"])
def test_the_post_shows_its_raids_banner(status: str) -> None:
    assert _post_embed(_event(status))["image"] == {"url": banner_url("onyxia")}


@pytest.mark.usefixtures("public_origin")
def test_a_cancelled_post_drops_its_banner() -> None:
    assert "image" not in _post_embed(_event("cancelled"))


# ---------------------------------------------------------------------------
# GET /discord/raid-banners/<raid key>.png
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_the_route_serves_the_banner_cached_for_a_year_at_its_hash() -> None:
    banner = BANNERS["onyxia"]
    response = await _get(f"/discord/raid-banners/onyxia.png?v={banner.version}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == _CACHE_CURRENT
    assert response.content == banner.png


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["?v=00000000", ""])
async def test_any_other_version_is_cached_briefly(query: str) -> None:
    response = await _get(f"/discord/raid-banners/onyxia.png{query}")
    assert response.status_code == 200
    assert response.headers["cache-control"] == _CACHE_OTHER


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "file_name",
    [
        "ragefire.png",
        "onyxia",
        "onyxia.PNG",
        "NOTICE.md",
        "..%2Fdiscord_emojis%2Fwarrior.png",
        "%2E%2E%2F%2E%2E%2F%2E%2E%2Fapp%2Fcore%2Fconfig.py",
    ],
)
async def test_the_route_serves_nothing_but_banners(file_name: str) -> None:
    assert (await _get(f"/discord/raid-banners/{file_name}")).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize(("enabled", "status"), [(True, 200), (False, 404)])
async def test_the_route_is_mounted_with_the_bot(monkeypatch: pytest.MonkeyPatch, enabled: bool, status: int) -> None:
    monkeypatch.setattr(settings, "discord_enabled", enabled)

    from app.main import create_app

    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as client:
        response = await client.get("/discord/raid-banners/onyxia.png")
    assert response.status_code == status


def test_the_api_docs_describe_the_route_as_a_png() -> None:
    app = FastAPI()
    app.include_router(discord_raid_banners.router)
    responses = app.openapi()["paths"]["/discord/raid-banners/{file_name}"]["get"]["responses"]
    assert set(responses["200"]["content"]) == {"image/png"}
