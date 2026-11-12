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

from app.api import wow_characters
from app.core.rate_limit import RateLimiter
from app.services.wow.blizzard.blizzard_token_cache import BlizzardTokenCache
from app.services.wow.character import character_service
from app.services.wow.character.blizzard_character_client import BlizzardCharacterClient
from app.services.wow.character.character_lookup_error import CharacterLookupError
from app.services.wow.character.character_mapper import to_character_response
from app.services.wow.character.character_profile import CharacterProfile
from app.services.wow.character.character_render_crop import crop_render
from app.services.wow.character.character_slug import normalize_character_slug
from app.services.wow.character.character_stats_mapper import to_character_stats
from app.services.wow.character.character_professions_mapper import to_character_professions
from app.services.wow.character.character_pvp_mapper import to_character_pvp
from app.services.wow.character.character_reputations_mapper import to_character_reputations
from app.services.wow.character.character_talents_mapper import to_character_talents

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
_CHANCE_ZERO: dict[str, Any] = {"rating_bonus": 0.0, "value": 0.0, "rating_normalized": 0}
# Trimmed from the real level-37 warlock's answer, retail leftovers included.
STATISTICS: dict[str, Any] = {
    "health": 1003, "power": 2373, "power_type": {"name": "Mana", "id": 0},
    "strength": {"base": 28, "effective": 28}, "agility": {"base": 39, "effective": 41},
    "intellect": {"base": 71, "effective": 114}, "stamina": {"base": 43, "effective": 64},
    "spirit": {"base": 70, "effective": 131},
    "mastery": _CHANCE_ZERO, "versatility": 0.0, "lifesteal": _CHANCE_ZERO, "avoidance": _CHANCE_ZERO,
    "attack_power": 18, "main_hand_damage_min": 58.37, "main_hand_damage_max": 85.37, "main_hand_speed": 3.4,
    "main_hand_dps": 21.14, "off_hand_damage_min": 1.79, "off_hand_damage_max": 1.79, "off_hand_speed": 2.0,
    "off_hand_dps": 0.89, "melee_crit": _CHANCE_ZERO, "melee_haste": _CHANCE_ZERO,
    "melee_hit": {"rating_bonus": 0.0, "value": 2.0, "rating_normalized": 0},
    "spell_power": 81, "spell_healing": 102, "spell_penetration": 0,
    "spell_crit": {"rating_bonus": 0.0, "value": 4.9376, "rating_normalized": 0},
    "spell_hit": {"rating_bonus": 0.0, "value": 2.0, "rating_normalized": 0}, "spell_haste": _CHANCE_ZERO,
    "mana_regen": 113.0, "mana_regen_combat": 0.0,
    "armor": {"base": 0, "effective": 364}, "defense": {"base": 172, "effective": 172},
    "dodge": {"rating_bonus": 0.0, "value": 4.4812, "rating_normalized": 0}, "parry": _CHANCE_ZERO, "block": _CHANCE_ZERO,
    "ranged_crit": {"rating_bonus": 0.0, "value": 4.8, "rating_normalized": 0}, "ranged_hit": _CHANCE_ZERO,
    "ranged_haste": _CHANCE_ZERO, "ranged_attack_power": 0, "ranged_damage_min": 30.0, "ranged_damage_max": 57.0,
    "shadow_resistance": {"base": 0, "effective": 10}, "fire_resistance": {"base": 0, "effective": 0},
    "movement_speed": 100.0, "expertise": 0.0,
}

SPECIALIZATIONS = {
    "specialization_groups": [
        {
            "is_active": False,
            "specializations": [
                {"specialization": {"name": "Destruction", "id": 357}, "spent_points": 1,
                 "talents": [{"talent": {"name": "Bane", "id": 135500}, "talent_rank": 1}]},
            ],
        },
        {
            "is_active": True,
            "specializations": [
                {"specialization": {"name": "Affliction", "id": 355}, "spent_points": 7, "talents": [
                    {"talent": {"name": "Suppression", "id": 135456}, "talent_rank": 2,
                     "spell_tooltip": {"description": "Improves your chance to hit by 2%."}},
                    {"talent": {"name": "Improved Corruption", "id": 135455}, "talent_rank": 5},
                    {"talent": {"name": "Broken", "id": "x"}, "talent_rank": 1},
                    {"talent": {"name": "Unranked", "id": 135449}, "talent_rank": 0},
                ]},
            ],
        },
        {"is_active": False, "specializations": []},
    ],
}

PROFESSIONS = {
    "primaries": [
        {"profession": {"name": "Tailoring", "id": 197}, "tiers": [
            {"skill_points": 148, "max_skill_points": 225, "tier": {"name": "Tailoring", "id": 197},
             "known_recipes": [
                 {"name": "Bolt of Linen Cloth", "id": 2963},
                 {"name": "Brown Linen Pants", "id": 3914},
                 {"name": "Broken", "id": "x"},
             ]},
        ]},
        {"profession": {"name": "Enchanting", "id": 333}, "tiers": [
            {"skill_points": 128, "max_skill_points": 225, "known_recipes": [{"name": "Disenchant", "id": 13262}]},
        ]},
        {"profession": {"name": "No skill", "id": 999}, "tiers": [{"known_recipes": []}]},
    ],
    "secondaries": [
        {"profession": {"name": "Fishing", "id": 356}, "tiers": [
            {"skill_points": 1, "max_skill_points": 75, "known_recipes": [{"name": "Fishing", "id": 7620}]},
        ]},
    ],
}

REPUTATIONS = {
    "reputations": [
        {"faction": {"name": "Stormwind", "id": 72},
         "standing": {"raw": 16888, "value": 7888, "max": 12000, "tier": 5, "name": "Honored"}},
        {"faction": {"name": "Booty Bay", "id": 21},
         "standing": {"raw": 737, "value": 737, "max": 3000, "tier": 3, "name": "Neutral"}},
        {"faction": {"name": "Broken", "id": 1}, "standing": {"name": "Neutral"}},
    ],
}

PVP_SUMMARY = {"honorable_kills": 21, "pvp_rank": 0, "character": {"name": "Jason", "surname": "Kwon"}}

# Shaped like Blizzard's (categories → sub_categories → statistics; quantities are floats).
ACHIEVEMENT_STATISTICS = {
    "categories": [
        {"id": 21, "name": "Player vs. Player", "statistics": [
            {"id": 1501, "name": "Total deaths from other players", "quantity": 31.0},
            {"id": 318, "name": "Total deaths from opposite faction", "quantity": 30.0},
        ]},
        {"id": 128, "name": "Kills", "statistics": [{"id": 1197, "name": "Total kills", "quantity": 5999.0}],
         "sub_categories": [{"id": 145, "name": "Honorable Kills", "statistics": [
             {"id": 588, "name": "Total Honorable Kills", "quantity": 21.0},
             {"id": 1458, "name": "Continent with the most Honorable Kills", "quantity": 17.0,
              "description": "Eastern Kingdoms"},
         ]}]},
    ],
}

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
        "/profile/wow/character/jason-kwon/statistics": _json(STATISTICS),
        "/profile/wow/character/jason-kwon/specializations": _json(SPECIALIZATIONS),
        "/profile/wow/character/jason-kwon/professions": _json(PROFESSIONS),
        "/profile/wow/character/jason-kwon/reputations": _json(REPUTATIONS),
        "/profile/wow/character/jason-kwon/pvp-summary": _json(PVP_SUMMARY),
        "/profile/wow/character/jason-kwon/achievements/statistics": _json(ACHIEVEMENT_STATISTICS),
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
    sheet = to_character_response("jason-kwon", CharacterProfile(profile=PROFILE, media=MEDIA, equipment=EQUIPMENT, statistics=STATISTICS, specializations=SPECIALIZATIONS, professions=PROFESSIONS, reputations=REPUTATIONS, pvp_summary=PVP_SUMMARY, achievement_statistics=ACHIEVEMENT_STATISTICS))
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
    sheet = to_character_response("jason-kwon", CharacterProfile(profile=PROFILE, media=None, equipment=None, statistics=None, specializations=None, professions=None, reputations=None, pvp_summary=None, achievement_statistics=None))
    assert sheet.has_render is False
    assert sheet.items == []


# --- crop ---------------------------------------------------------------------


def test_the_stats_are_blizzards_totals_without_retail_leftovers() -> None:
    stats = to_character_stats(STATISTICS, EQUIPMENT)
    assert stats is not None
    assert (stats.health, stats.power, stats.power_type) == (1003, 2373, "Mana")
    assert (stats.intellect.base, stats.intellect.effective) == (71, 114)
    assert stats.spell.crit == pytest.approx(4.9376) and stats.spell.power == 81 and stats.spell.healing == 102
    assert stats.spell.mana_regen_casting == 0.0
    assert (stats.defenses.armor.effective, stats.defenses.defense.effective) == (364, 172)
    assert stats.defenses.armor.base == 0  # all of it from gear: a real 0 base is kept, not replaced
    assert stats.spirit.base == 70
    assert stats.resistances.shadow == 10 and stats.resistances.arcane == 0
    assert stats.ranged.damage is not None and stats.ranged.damage.max == 57.0  # the wand is in the ranged slot
    assert not {"mastery", "versatility", "lifesteal", "avoidance"} & set(stats.model_dump())


def test_weapon_damage_shows_only_for_hands_that_hold_a_weapon() -> None:
    # The fixture's gear has no main- or off-hand weapon: Blizzard's unarmed numbers stay hidden.
    stats = to_character_stats(STATISTICS, EQUIPMENT)
    assert stats is not None and stats.melee.main_hand is None and stats.melee.off_hand is None
    staff = {"slot": {"type": "MAIN_HAND"}, "weapon": {"damage": {"display_string": "54 - 81 Damage"}}}
    stats = to_character_stats(STATISTICS, {"equipped_items": [staff]})
    assert stats is not None and stats.melee.main_hand is not None and stats.melee.main_hand.speed == 3.4
    assert stats.melee.off_hand is None and stats.ranged.damage is None


def test_no_statistics_yet_is_no_stats_panel() -> None:
    assert to_character_stats(None, EQUIPMENT) is None
    assert to_character_stats({}, EQUIPMENT) is None


def test_the_crop_follows_the_figure_with_a_margin() -> None:
    cropped = Image.open(BytesIO(crop_render(_png(1600, 1200, (700, 500, 900, 960)))))
    # 200 x 460 figure + 6% of 460 (28 px) on each side.
    assert cropped.size == (256, 516)


@pytest.mark.parametrize("png", [b"not an image", _png(40, 40, None)])
def test_an_unreadable_or_empty_render_is_an_error(png: bytes) -> None:
    with pytest.raises(CharacterLookupError):
        crop_render(png)


def test_a_render_far_bigger_than_blizzards_is_refused_before_decoding() -> None:
    with pytest.raises(CharacterLookupError, match="too big"):
        crop_render(_png(3300, 2400, None))


# --- service + routes ---------------------------------------------------------


async def test_a_render_the_render_host_doesnt_have_is_no_picture(monkeypatch: pytest.MonkeyPatch) -> None:
    base = _blizzard()

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.host == "render.worldofwarcraft.com":
            return httpx.Response(404)
        return base(request)

    monkeypatch.setattr(character_service, "_new_client", lambda: _client(handle))
    assert await character_service.get_character_render("jason-kwon") is None


async def test_a_statistics_failure_still_shows_the_sheet_and_is_not_cached(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    seen: list[httpx.Request] = []
    failing = {"/profile/wow/character/jason-kwon/statistics": _json({"code": 503}, 503)}
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(failing, seen=seen)))
    sheet = await character_service.get_character("jason-kwon")
    assert sheet.stats is None
    assert len(sheet.items) > 0
    assert "Character statistics unavailable" in caplog.text
    await character_service.get_character("jason-kwon")
    profile_calls = [r for r in seen if r.url.path == "/profile/wow/character/jason-kwon"]
    assert len(profile_calls) == 2


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
    # profile, media, equipment, statistics, specializations, professions, reputations, pvp-summary,
    # achievements/statistics
    assert len(api_calls) == 9
    assert [r.url.host for r in seen].count("render.worldofwarcraft.com") == 1


async def test_route_returns_the_sheet(client: AsyncClient) -> None:
    sheet = to_character_response("jason-kwon", CharacterProfile(profile=PROFILE, media=MEDIA, equipment=EQUIPMENT, statistics=STATISTICS, specializations=SPECIALIZATIONS, professions=PROFESSIONS, reputations=REPUTATIONS, pvp_summary=PVP_SUMMARY, achievement_statistics=ACHIEVEMENT_STATISTICS))
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


async def test_render_route_has_its_own_per_ip_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wow_characters, "character_render_limiter", RateLimiter(max_attempts=1, window_seconds=60))
    with patch.object(character_service, "get_character_render", AsyncMock(return_value=None)) as get:
        first = await client.get("/wow/characters/jason-kwon/render.png")
        second = await client.get("/wow/characters/jason-kwon/render.png")
    assert (first.status_code, second.status_code) == (404, 429)
    get.assert_awaited_once()


def test_the_talents_are_ids_and_ranks_with_the_active_set_first() -> None:
    talents = to_character_talents(SPECIALIZATIONS)
    assert talents is not None
    assert [group.active for group in talents.groups] == [True, False]  # the empty set is dropped
    assert [(p.id, p.rank) for p in talents.groups[0].picks] == [(135456, 2), (135455, 5)]
    assert [(p.id, p.rank) for p in talents.groups[1].picks] == [(135500, 1)]


def test_an_empty_active_set_is_kept_so_the_other_set_isnt_shown_as_current() -> None:
    respecced = {"specialization_groups": [
        {"is_active": True, "specializations": []},
        SPECIALIZATIONS["specialization_groups"][1] | {"is_active": False},
    ]}
    talents = to_character_talents(respecced)
    assert talents is not None
    assert [(group.active, len(group.picks)) for group in talents.groups] == [(True, 0), (False, 2)]


def test_no_talents_is_an_empty_list_and_a_failure_is_none() -> None:
    assert to_character_talents({}) is not None and to_character_talents({}).groups == []
    assert to_character_talents(None) is None


async def test_a_character_blizzard_has_no_talents_for_has_none_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    missing = {"/profile/wow/character/jason-kwon/specializations": _json({"code": 404}, 404)}
    seen: list[httpx.Request] = []
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(missing, seen=seen)))
    sheet = await character_service.get_character("jason-kwon")
    assert sheet.talents is not None and sheet.talents.groups == []
    await character_service.get_character("jason-kwon")
    profile_calls = [r for r in seen if r.url.path == "/profile/wow/character/jason-kwon"]
    assert len(profile_calls) == 1  # an answer, so it's cached


async def test_a_talents_failure_still_shows_the_sheet_and_is_not_cached(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    seen: list[httpx.Request] = []
    failing = {"/profile/wow/character/jason-kwon/specializations": _json({"code": 503}, 503)}
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(failing, seen=seen)))
    sheet = await character_service.get_character("jason-kwon")
    assert sheet.talents is None
    assert sheet.stats is not None and len(sheet.items) > 0
    assert "Character talents unavailable" in caplog.text
    await character_service.get_character("jason-kwon")
    profile_calls = [r for r in seen if r.url.path == "/profile/wow/character/jason-kwon"]
    assert len(profile_calls) == 2


def test_the_professions_keep_skill_cap_and_known_recipes() -> None:
    professions = to_character_professions(PROFESSIONS)
    assert professions is not None
    tailoring, enchanting = professions.primaries  # a profession with no skill is dropped
    assert (tailoring.id, tailoring.name, tailoring.skill, tailoring.max_skill) == (197, "Tailoring", 148, 225)
    assert [(r.id, r.name) for r in tailoring.recipes] == [(2963, "Bolt of Linen Cloth"), (3914, "Brown Linen Pants")]
    assert [r.id for r in enchanting.recipes] == [13262]
    assert [(p.name, p.skill, p.max_skill) for p in professions.secondaries] == [("Fishing", 1, 75)]


def test_two_tiers_show_the_highest_skill_and_merge_the_recipes() -> None:
    raw = {"primaries": [{"profession": {"name": "Tailoring", "id": 197}, "tiers": [
        {"skill_points": 40, "max_skill_points": 75, "known_recipes": [{"name": "A", "id": 1}]},
        {"skill_points": 148, "max_skill_points": 225, "known_recipes": [{"name": "A", "id": 1}, {"name": "B", "id": 2}]},
    ]}]}
    professions = to_character_professions(raw)
    assert professions is not None
    (tailoring,) = professions.primaries
    assert (tailoring.skill, tailoring.max_skill) == (148, 225)
    assert [r.id for r in tailoring.recipes] == [1, 2]


def test_no_professions_is_two_empty_lists_and_a_failure_is_none() -> None:
    empty = to_character_professions({})
    assert empty is not None and empty.primaries == [] and empty.secondaries == []
    assert to_character_professions(None) is None


async def test_a_character_with_no_professions_has_none_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    missing = {"/profile/wow/character/jason-kwon/professions": _json({"code": 404}, 404)}
    seen: list[httpx.Request] = []
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(missing, seen=seen)))
    sheet = await character_service.get_character("jason-kwon")
    assert sheet.professions is not None and sheet.professions.primaries == []
    await character_service.get_character("jason-kwon")
    profile_calls = [r for r in seen if r.url.path == "/profile/wow/character/jason-kwon"]
    assert len(profile_calls) == 1  # an answer, so it's cached


async def test_a_professions_failure_still_shows_the_sheet_and_is_not_cached(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    seen: list[httpx.Request] = []
    failing = {"/profile/wow/character/jason-kwon/professions": _json({"code": 503}, 503)}
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(failing, seen=seen)))
    sheet = await character_service.get_character("jason-kwon")
    assert sheet.professions is None
    assert sheet.talents is not None and len(sheet.items) > 0
    assert "Character professions unavailable" in caplog.text
    await character_service.get_character("jason-kwon")
    profile_calls = [r for r in seen if r.url.path == "/profile/wow/character/jason-kwon"]
    assert len(profile_calls) == 2


def test_the_reputations_keep_standing_and_progress_and_drop_broken_rows() -> None:
    reputations = to_character_reputations(REPUTATIONS)
    assert reputations is not None
    assert [(r.id, r.name, r.standing, r.tier, r.value, r.max) for r in reputations] == [
        (72, "Stormwind", "Honored", 5, 7888, 12000),
        (21, "Booty Bay", "Neutral", 3, 737, 3000),
    ]


def test_no_reputations_is_an_empty_list_and_a_failure_is_none() -> None:
    assert to_character_reputations({}) == []
    assert to_character_reputations(None) is None


async def test_a_character_with_no_reputations_has_an_empty_list_and_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    missing = {"/profile/wow/character/jason-kwon/reputations": _json({"code": 404}, 404)}
    seen: list[httpx.Request] = []
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(missing, seen=seen)))
    sheet = await character_service.get_character("jason-kwon")
    assert sheet.reputations == []
    await character_service.get_character("jason-kwon")
    profile_calls = [r for r in seen if r.url.path == "/profile/wow/character/jason-kwon"]
    assert len(profile_calls) == 1


async def test_a_reputations_failure_still_shows_the_sheet_and_is_not_cached(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    seen: list[httpx.Request] = []
    failing = {"/profile/wow/character/jason-kwon/reputations": _json({"code": 503}, 503)}
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(failing, seen=seen)))
    sheet = await character_service.get_character("jason-kwon")
    assert sheet.reputations is None
    assert sheet.professions is not None and len(sheet.items) > 0
    assert "Character reputations unavailable" in caplog.text
    await character_service.get_character("jason-kwon")
    profile_calls = [r for r in seen if r.url.path == "/profile/wow/character/jason-kwon"]
    assert len(profile_calls) == 2


def test_the_pvp_record_is_rank_kills_and_deaths_from_players() -> None:
    pvp = to_character_pvp(PVP_SUMMARY, ACHIEVEMENT_STATISTICS)
    assert pvp is not None
    assert (pvp.rank, pvp.honorable_kills) == (0, 21)
    assert (pvp.deaths_from_players, pvp.deaths_from_opposite_faction) == (31, 30)
    assert (pvp.top_honor_continent, pvp.top_honor_continent_kills) == ("Eastern Kingdoms", 17)


def test_a_statistic_never_moved_is_zero_but_missing_statistics_are_unknown() -> None:
    quiet = to_character_pvp({}, {"categories": []})
    assert quiet is not None
    assert (quiet.rank, quiet.honorable_kills, quiet.deaths_from_players) == (0, 0, 0)
    assert quiet.top_honor_continent is None and quiet.top_honor_continent_kills is None
    unknown = to_character_pvp(PVP_SUMMARY, None)
    assert unknown is not None
    assert unknown.honorable_kills == 21
    assert unknown.deaths_from_players is None and unknown.deaths_from_opposite_faction is None
    assert to_character_pvp(None, ACHIEVEMENT_STATISTICS) is None


async def test_a_pvp_failure_still_shows_the_sheet_and_is_not_cached(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    seen: list[httpx.Request] = []
    failing = {"/profile/wow/character/jason-kwon/pvp-summary": _json({"code": 503}, 503)}
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(failing, seen=seen)))
    sheet = await character_service.get_character("jason-kwon")
    assert sheet.pvp is None
    assert sheet.reputations is not None and len(sheet.items) > 0
    assert "Character PvP summary unavailable" in caplog.text
    await character_service.get_character("jason-kwon")
    profile_calls = [r for r in seen if r.url.path == "/profile/wow/character/jason-kwon"]
    assert len(profile_calls) == 2


async def test_a_statistics_pane_failure_keeps_the_pvp_kills_without_deaths(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    failing = {"/profile/wow/character/jason-kwon/achievements/statistics": _json({"code": 503}, 503)}
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(failing)))
    sheet = await character_service.get_character("jason-kwon")
    assert sheet.pvp is not None
    assert sheet.pvp.honorable_kills == 21 and sheet.pvp.deaths_from_players is None
    assert "Character achievement statistics unavailable" in caplog.text


async def test_a_character_blizzard_has_no_pvp_summary_for_has_zeros_and_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    missing = {
        "/profile/wow/character/jason-kwon/pvp-summary": _json({"code": 404}, 404),
        "/profile/wow/character/jason-kwon/achievements/statistics": _json({"code": 404}, 404),
    }
    seen: list[httpx.Request] = []
    monkeypatch.setattr(character_service, "_new_client", lambda: _client(_blizzard(missing, seen=seen)))
    sheet = await character_service.get_character("jason-kwon")
    assert sheet.pvp is not None
    assert (sheet.pvp.rank, sheet.pvp.honorable_kills, sheet.pvp.deaths_from_players) == (0, 0, 0)
    await character_service.get_character("jason-kwon")
    profile_calls = [r for r in seen if r.url.path == "/profile/wow/character/jason-kwon"]
    assert len(profile_calls) == 1
