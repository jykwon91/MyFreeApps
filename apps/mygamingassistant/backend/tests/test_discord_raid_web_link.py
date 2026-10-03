"""The raid post's [Web view] link (row 4) and the raid icons route.

[Web view] is a link button to the raid's web page: Discord opens it, no
interaction comes back.  It goes out only from a public https origin, never
on a draft, and stays enabled when every other button is off.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from platform_shared.services.discord import BUTTON_STYLE_LINK, EMPTY_EMOJIS, EmojiRef, EmojiSet
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import discord_raid_icons
from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.wow.raid_icon_files import ICONS, ICONS_VERSION
from app.services.wow.raid_post_buttons import build_signup_components

from discord_raid_harness import FakeDiscord, Post, create_and_post, setup_guild

_ORIGIN = "https://mga.example"
_NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
_CACHE_CURRENT = "public, max-age=31536000, immutable"
_CACHE_OTHER = "public, max-age=3600"


@pytest.fixture
def public_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "frontend_url", f"{_ORIGIN}/")


def _event(status: str = "scheduled", **overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": uuid.uuid4(),
        "web_id": uuid.uuid4(),
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": datetime(2026, 10, 11, tzinfo=timezone.utc),
        "size_cap": 40,
        "status": status,
        "channel_id": "c1",
        "created_by_user_id": "u0",
        "created_by_display_name": "Thrall",
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _rows(event: WowRaidEvent, emojis: EmojiSet = EMPTY_EMOJIS) -> list[list[dict[str, Any]]]:
    return [row["components"] for row in build_signup_components(event, [], emojis=emojis)]


def _link(event: WowRaidEvent) -> dict[str, Any]:
    return {
        "type": 2,
        "style": BUTTON_STYLE_LINK,
        "label": "Web view",
        "url": f"{_ORIGIN}/wow-forever/raids/{event.web_id.hex}",
    }


# ---------------------------------------------------------------------------
# Row 4
# ---------------------------------------------------------------------------


@pytest.mark.usefixtures("public_origin")
@pytest.mark.parametrize(
    ("status", "overrides"),
    [
        ("scheduled", {}),
        ("scheduled", {"closed_at": _NOW}),
        ("scheduled", {"start_applied_at": _NOW}),
        ("completed", {"start_applied_at": _NOW}),
        ("cancelled", {}),
    ],
)
def test_row_4_links_the_raids_page_whatever_its_state(status: str, overrides: dict) -> None:
    event = _event(status, **overrides)
    rows = _rows(event)
    assert len(rows) == 4
    assert rows[3] == [_link(event)]
    assert len(event.web_id.hex) == 32


def test_the_link_adds_a_row_and_changes_no_other(monkeypatch: pytest.MonkeyPatch) -> None:
    event = _event()
    without = _rows(event)
    monkeypatch.setattr(settings, "frontend_url", _ORIGIN)
    with_link = _rows(event)
    assert (len(without), with_link[:3]) == (3, without)
    assert all(len(row) <= 5 for row in with_link) and len(with_link) <= 5


@pytest.mark.usefixtures("public_origin")
def test_no_link_on_a_draft() -> None:
    assert len(_rows(_event("draft"))) == 3


@pytest.mark.parametrize("origin", ["http://localhost:5176", "http://mga.example", ""])
def test_no_link_without_a_public_https_origin(monkeypatch: pytest.MonkeyPatch, origin: str) -> None:
    monkeypatch.setattr(settings, "frontend_url", origin)
    assert len(_rows(_event())) == 3


@pytest.mark.usefixtures("public_origin")
def test_the_link_shows_the_globe_icon_once_uploaded() -> None:
    icons = EmojiSet({"info_globe": EmojiRef("1400000000000000001", "info_globe__a1b2c3")})
    event = _event()
    globe = {"id": "1400000000000000001", "name": "info_globe__a1b2c3"}
    assert _rows(event, icons)[3] == [{**_link(event), "emoji": globe}]


@pytest.mark.asyncio
async def test_the_posted_raid_links_its_own_page(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "frontend_url", _ORIGIN)
    await setup_guild(post)
    event = await create_and_post(post, db)
    posted = fake_discord.channel_posts()[-1].body
    assert posted is not None
    rows = [row["components"] for row in posted["components"]]
    assert len(rows) == 4
    assert rows[3] == [_link(event)]


# ---------------------------------------------------------------------------
# GET /discord/raid-icons/<name>.png
# ---------------------------------------------------------------------------


async def _get(path: str) -> Response:
    app = FastAPI()
    app.include_router(discord_raid_icons.router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path)


@pytest.mark.asyncio
async def test_the_route_serves_an_icon_cached_for_a_year_at_the_version() -> None:
    response = await _get(f"/discord/raid-icons/warrior_fury.png?v={ICONS_VERSION}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == _CACHE_CURRENT
    assert response.content == ICONS["warrior_fury"]


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["?v=00000000", ""])
async def test_any_other_version_is_cached_briefly(query: str) -> None:
    response = await _get(f"/discord/raid-icons/role_tank.png{query}")
    assert (response.status_code, response.headers["cache-control"]) == (200, _CACHE_OTHER)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "file_name",
    [
        "nope.png",
        "warrior_fury",
        "warrior_fury.PNG",
        "NOTICE.md",
        "..%2Fraid_banners%2Fonyxia.png",
        "%2E%2E%2F%2E%2E%2F%2E%2E%2Fapp%2Fcore%2Fconfig.py",
    ],
)
async def test_the_route_serves_nothing_but_icons(file_name: str) -> None:
    assert (await _get(f"/discord/raid-icons/{file_name}")).status_code == 404


def test_the_api_docs_describe_the_icon_route_as_a_png() -> None:
    app = FastAPI()
    app.include_router(discord_raid_icons.router)
    responses = app.openapi()["paths"]["/discord/raid-icons/{file_name}"]["get"]["responses"]
    assert set(responses["200"]["content"]) == {"image/png"}
