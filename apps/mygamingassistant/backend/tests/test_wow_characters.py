"""WoW Forever "Your character": slug rules, Blizzard client, mapper, render crop, routes.

Covers: the first-surname slug (letters of any alphabet, two names, lowercase),
one shared token across lookups and a fresh one after Blizzard drops it, the
``profile-forever-us`` namespace, a missing character (404) vs a character
without a render or gear yet, the render fetched only from Blizzard's render
host, the mapper keeping the game's own tooltip lines (green Equip bonuses,
weapon damage, Use: spells, hidden subtypes, worn durability) and dropping
malformed items, the crop following the figure, and the routes' 400/404/502.
"""
from __future__ import annotations

import json
from collections.abc import Callable
from io import BytesIO
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from httpx import AsyncClient
from PIL import Image

from app.services.wow.blizzard.blizzard_token_cache import BlizzardTokenCache
from app.services.wow.character import character_service
from app.services.wow.character.blizzard_character_client import BlizzardCharacterClient
from app.services.wow.character.character_lookup_error import CharacterLookupError
from app.services.wow.character.character_mapper import to_character_response
from app.services.wow.character.character_profile import CharacterProfile
from app.services.wow.character.character_render_crop import crop_render
from app.services.wow.character.character_slug import normalize_character_slug

RENDER_URL = "https://render.worldofwarcraft.com/forever-us/character/101/6299749-main-raw.png"
PROFILE: dict[str, Any] = {
    "id": 6299749,
    "name": "Jason",
    "surname": "Kwon",
    "level": 37,
    "race": {"name": "Gnome", "id": 7},
    "character_class": {"name": "Warlock", "id": 9},
    "gender": {"type": "FEMALE", "name": "Female"},
    "faction": {"type": "ALLIANCE", "name": "Alliance"},
    "guild": {"name": "Tinker Town"},
    "ruleset": {"name": "PvP", "id": 1},
    "equipped_item_level": 28,
    "last_login_timestamp": 1794438664000,
    "achievement_points": 0,
}
MEDIA: dict[str, Any] = {
    "assets": [
        {"key": "avatar", "value": "https://render.worldofwarcraft.com/forever-us/character/101/6299749-avatar.jpg"},
        {"key": "main-raw", "value": RENDER_URL},
    ]
}
HAT: dict[str, Any] = {
    "item": {"id": 3556},
    "slot": {"type": "HEAD", "name": "Head"},
    "quality": {"type": "UNCOMMON", "name": "Uncommon"},
    "name": "Dread Mage Hat",
    "item_subclass": {"name": "Cloth", "id": 1},
    "inventory_type": {"type": "HEAD", "name": "Head"},
    "binding": {"type": "ON_ACQUIRE", "name": "Binds when picked up"},
    "armor": {"value": 35, "display": {"display_string": "35 Armor"}},
    "stats": [
        {"type": {"type": "INTELLECT"}, "value": 7, "display": {"display_string": "+7 Intellect"}},
        {"type": {"type": "SPIRIT"}, "value": 7, "is_equip_bonus": True, "display": {"display_string": "+7 Spirit"}},
    ],
    "requirements": {"playable_classes": {"display_string": "Classes: Warlock"}},
    "level": {"value": 30, "display_string": "Item Level 30"},
    "durability": {"value": 21, "display_string": "Durability 21 / 45"},
    "context": 11,
}
TRINKET: dict[str, Any] = {
    "item": {"id": 284001},
    "slot": {"type": "TRINKET_1", "name": "Trinket 1"},
    "quality": {"type": "RARE"},
    "name": "Satchel of Potions",
    "item_subclass": {"name": "Miscellaneous"},
    "is_subclass_hidden": True,
    "inventory_type": {"type": "TRINKET", "name": "Trinket"},
    "spells": [{"spell": {"id": 1309685}, "description": "Use: Reach into the bag and hope for the best."}],
    "description": "Not every potion is meant for consumption.",
    "level": {"value": 35},
}
WAND: dict[str, Any] = {
    "item": {"id": 7001},
    "slot": {"type": "RANGED", "name": "Ranged"},
    "quality": {"type": "UNCOMMON"},
    "name": "Gravestone Scepter",
    "item_subclass": {"name": "Wand"},
    "inventory_type": {"type": "RANGEDRIGHT", "name": "Ranged"},
    "weapon": {
        "damage": {"display_string": "30 - 57 Shadow Damage"},
        "attack_speed": {"display_string": "Speed 1.50"},
        "dps": {"display_string": "(29.0 damage per second)"},
    },
    "level": {"value": 31},
    "durability": {"display_string": "Durability 60 / 65"},
}
EQUIPMENT: dict[str, Any] = {"equipped_items": [HAT, TRINKET, WAND, {"slot": {"type": "NECK"}}]}

Handler = Callable[[httpx.Request], httpx.Response]


def _json(body: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, content=json.dumps(body).encode())


def _png(width: int, height: int, box: tuple[int, int, int, int] | None) -> bytes:
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    if box is not None:
        image.paste((200, 100, 50, 255), box)
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def _blizzard(
    answers: dict[str, httpx.Response] | None = None,
    *,
    seen: list[httpx.Request] | None = None,
) -> Handler:
    routes = {
        "/profile/wow/character/jason-kwon": _json(PROFILE),
        "/profile/wow/character/jason-kwon/character-media": _json(MEDIA),
        "/profile/wow/character/jason-kwon/equipment": _json(EQUIPMENT),
        **(answers or {}),
    }

    def handle(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if request.url.host == "oauth.battle.net":
            return _json({"access_token": "tok", "expires_in": 86399})
        if request.url.host == "render.worldofwarcraft.com":
            return httpx.Response(200, content=_png(400, 300, (180, 150, 220, 290)))
        assert request.headers["Authorization"] == "Bearer tok"
        assert request.url.params["namespace"] == "profile-forever-us"
        return routes.get(request.url.path, _json({"code": 404, "type": "BLZWEBAPI00000404"}, 404))

    return handle


def _client(handler: Handler, tokens: BlizzardTokenCache | None = None) -> BlizzardCharacterClient:
    return BlizzardCharacterClient(
        "id", "secret", tokens or BlizzardTokenCache(), transport=httpx.MockTransport(handler),
    )


@pytest.fixture(autouse=True)
def _clean_caches() -> None:
    character_service.clear_caches()


# --- slug ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("jason-kwon", "jason-kwon"),
        (" Jason-Kwon ", "jason-kwon"),
        ("zoë-ashford", "zoë-ashford"),
        ("jason", None),
        ("jason-kwon-extra", None),
        ("jason-kw0n", None),
        ("j-kwon", None),
        ("jason_kwon", None),
        ("../admin-x", None),
    ],
)
def test_the_slug_is_two_names_of_letters(raw: str, expected: str | None) -> None:
    assert normalize_character_slug(raw) == expected


# --- client -------------------------------------------------------------------


async def test_one_token_serves_every_lookup_until_it_expires() -> None:
    seen: list[httpx.Request] = []
    tokens = BlizzardTokenCache()
    async with _client(_blizzard(seen=seen), tokens) as client:
        await client.profile("jason-kwon")
        await client.equipment("jason-kwon")
    async with _client(_blizzard(seen=seen), tokens) as client:
        await client.media("jason-kwon")
    assert [r.url.host for r in seen].count("oauth.battle.net") == 1


async def test_a_dropped_token_is_forgotten_so_the_next_lookup_asks_again() -> None:
    tokens = BlizzardTokenCache()
    denied = _blizzard({"/profile/wow/character/jason-kwon": _json({"code": 401, "type": "BLZWEBAPI00000401"}, 401)})
    async with _client(denied, tokens) as client:
        with pytest.raises(CharacterLookupError) as caught:
            await client.profile("jason-kwon")
    assert caught.value.status_code == 401
    seen: list[httpx.Request] = []
    async with _client(_blizzard(seen=seen), tokens) as client:
        await client.profile("jason-kwon")
    assert seen[0].url.host == "oauth.battle.net"


async def test_no_character_by_that_name_is_a_404_with_blizzards_code() -> None:
    async with _client(_blizzard()) as client:
        with pytest.raises(CharacterLookupError) as caught:
            await client.profile("nobody-here")
    assert caught.value.status_code == 404
    assert caught.value.code == "BLZWEBAPI00000404"


async def test_a_character_without_a_render_or_gear_yet_is_not_an_error() -> None:
    missing = {
        "/profile/wow/character/jason-kwon/character-media": _json({"code": 404}, 404),
        "/profile/wow/character/jason-kwon/equipment": _json({"code": 404}, 404),
    }
    async with _client(_blizzard(missing)) as client:
        assert await client.media("jason-kwon") is None
        assert await client.equipment("jason-kwon") is None


@pytest.mark.parametrize(
    "url",
    [
        "http://render.worldofwarcraft.com/x.png",
        "https://evil.example.com/x.png",
        "https://render.worldofwarcraft.com.evil.example.com/x.png",
    ],
)
async def test_the_render_comes_only_from_blizzards_render_host(url: str) -> None:
    async with _client(_blizzard()) as client:
        with pytest.raises(CharacterLookupError, match="not on render.worldofwarcraft.com"):
            await client.render(url)


def test_missing_credentials_fail_before_any_request() -> None:
    with pytest.raises(CharacterLookupError, match="BLIZZARD_CLIENT_ID"):
        BlizzardCharacterClient("", "secret", BlizzardTokenCache())


# --- mapper -------------------------------------------------------------------


def test_the_sheet_keeps_the_games_own_tooltip_lines() -> None:
    sheet = to_character_response("jason-kwon", CharacterProfile(profile=PROFILE, media=MEDIA, equipment=EQUIPMENT))
    assert (sheet.name, sheet.surname, sheet.level, sheet.race, sheet.class_name) == ("Jason", "Kwon", 37, "Gnome", "Warlock")
    assert (sheet.faction, sheet.guild, sheet.ruleset, sheet.has_render) == ("alliance", "Tinker Town", "PvP", True)
    assert sheet.last_login is not None and sheet.last_login.year == 2026
    hat, trinket, wand = sheet.items  # the malformed neck is left out
    assert (hat.quality, hat.item_level, hat.subclass_name, hat.armor) == ("uncommon", 30, "Cloth", "35 Armor")
    assert [(s.text, s.equip_bonus) for s in hat.stats] == [("+7 Intellect", False), ("+7 Spirit", True)]
    assert hat.requirements == ["Classes: Warlock"]
    assert hat.durability_low is True  # 21 / 45
    assert trinket.subclass_name is None  # the game hides "Miscellaneous"
    assert trinket.spells == ["Use: Reach into the bag and hope for the best."]
    assert trinket.description == "Not every potion is meant for consumption."
    assert trinket.durability is None and trinket.durability_low is False
    assert wand.weapon is not None and wand.weapon.damage == "30 - 57 Shadow Damage"
    assert wand.durability_low is False  # 60 / 65


def test_a_character_without_media_or_gear_has_an_empty_sheet() -> None:
    sheet = to_character_response("jason-kwon", CharacterProfile(profile=PROFILE, media=None, equipment=None))
    assert sheet.has_render is False
    assert sheet.items == []


# --- crop ---------------------------------------------------------------------


def test_the_crop_follows_the_figure_with_a_margin() -> None:
    cropped = Image.open(BytesIO(crop_render(_png(1600, 1200, (700, 500, 900, 960)))))
    # 200 x 460 figure + 6% of 460 (28 px) on each side.
    assert cropped.size == (256, 516)


@pytest.mark.parametrize("png", [b"not an image", _png(40, 40, None)])
def test_an_unreadable_or_empty_render_is_an_error(png: bytes) -> None:
    with pytest.raises(CharacterLookupError):
        crop_render(png)


# --- service + routes ---------------------------------------------------------


async def test_the_sheet_and_render_ask_blizzard_once(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[httpx.Request] = []
    tokens = BlizzardTokenCache()
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(seen=seen), tokens))
    await character_service.get_character("jason-kwon")
    await character_service.get_character("jason-kwon")
    render = await character_service.get_character_render("jason-kwon")
    await character_service.get_character_render("jason-kwon")
    assert render is not None and Image.open(BytesIO(render)).size[0] < 400
    api_calls = [r.url.path for r in seen if r.url.host == "us.api.blizzard.com"]
    assert len(api_calls) == 3
    assert [r.url.host for r in seen].count("render.worldofwarcraft.com") == 1


async def test_route_returns_the_sheet(client: AsyncClient) -> None:
    sheet = to_character_response("jason-kwon", CharacterProfile(profile=PROFILE, media=MEDIA, equipment=EQUIPMENT))
    with patch.object(character_service, "get_character", AsyncMock(return_value=sheet)) as get:
        resp = await client.get("/wow/characters/Jason-Kwon")
    assert resp.status_code == 200
    get.assert_awaited_once_with("jason-kwon")
    assert resp.json()["items"][0]["name"] == "Dread Mage Hat"
    assert "max-age" in resp.headers["Cache-Control"]


@pytest.mark.parametrize(
    ("error", "status", "detail"),
    [
        (CharacterLookupError("Not Found", status_code=404), 404, "character_not_found"),
        (CharacterLookupError("Service Unavailable", status_code=503), 502, "character_upstream_failed"),
        (CharacterLookupError("request failed: ConnectTimeout"), 502, "character_upstream_failed"),
    ],
)
async def test_route_maps_blizzard_failures(
    client: AsyncClient, error: CharacterLookupError, status: int, detail: str,
) -> None:
    with patch.object(character_service, "get_character", AsyncMock(side_effect=error)):
        resp = await client.get("/wow/characters/jason-kwon")
    assert resp.status_code == status
    assert resp.json()["detail"] == detail


async def test_route_refuses_a_name_that_isnt_two_names(client: AsyncClient) -> None:
    with patch.object(character_service, "get_character", AsyncMock()) as get:
        resp = await client.get("/wow/characters/jason")
    assert resp.status_code == 400
    get.assert_not_awaited()


async def test_render_route_serves_the_png_or_404s(client: AsyncClient) -> None:
    png = _png(10, 10, (2, 2, 8, 8))
    with patch.object(character_service, "get_character_render", AsyncMock(return_value=png)):
        resp = await client.get("/wow/characters/jason-kwon/render.png")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert resp.content == png
    with patch.object(character_service, "get_character_render", AsyncMock(return_value=None)):
        resp = await client.get("/wow/characters/jason-kwon/render.png")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "character_render_not_found"
