"""Stored WoW Forever characters: the sheet, the daily history, gone / renamed / reused names, the purge.

Covers the pure pieces (the numbers a fetch stores, the sheet merge keeping a
section Blizzard failed to send, the sheet codec and its version pin) and,
against Postgres, ``character_store_service`` and the look-up that calls it:
a fresh fetch stores, a cached one doesn't, a 404 marks a stored character
gone and stores nothing for an unknown name, a failure keeps the sheet, a
rename keeps the history, a name taken by a new character marks the old one
gone, and a storage failure never breaks the page.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_character import CHARACTER_SHEET_VERSION
from app.models.wow.character import WowCharacter
from app.models.wow.character_daily_metric import WowCharacterDailyMetric
from app.repositories.wow import character_metric_repo
from app.schemas.wow.character.character_response import CharacterResponse
from app.services.wow.blizzard.blizzard_token_cache import BlizzardTokenCache
from app.services.wow.character import character_lookup_service, character_service, character_store_service
from app.services.wow.character.blizzard_character_client import BlizzardCharacterClient
from app.services.wow.character.character_fetch import CharacterFetch
from app.services.wow.character.character_lookup_error import CharacterLookupError
from app.services.wow.character.character_mapper import to_character_response
from app.services.wow.character.character_metrics_mapper import to_character_metrics
from app.services.wow.character.character_profession_level import CharacterProfessionLevel
from app.services.wow.character.character_profile import CharacterProfile
from app.services.wow.character.character_sheet_codec import read_sheet, to_sheet_json
from app.services.wow.character.character_sheet_merge import merge_sheet

# Bump with CHARACTER_SHEET_VERSION when CharacterResponse changes (see app/core/wow_character.py).
SHEET_SCHEMA_HASH = "d89bf789936beb24ca4e9e655a138b5b1f26aca89bf042faf1f854f9a87cbb08"

NOW = datetime(2026, 11, 12, 18, 0, tzinfo=timezone.utc)
PROFILE: dict[str, Any] = {
    "id": 6299749,
    "name": "Jason",
    "surname": "Kwon",
    "level": 37,
    "race": {"name": "Gnome", "id": 7},
    "character_class": {"name": "Warlock", "id": 9},
    "gender": {"type": "FEMALE", "name": "Female"},
    "faction": {"type": "ALLIANCE", "name": "Alliance"},
    "equipped_item_level": 28,
}
PROFESSIONS: dict[str, Any] = {
    "primaries": [{"profession": {"name": "Tailoring", "id": 197}, "tiers": [
        {"skill_points": 148, "max_skill_points": 225, "known_recipes": []},
    ]}],
    "secondaries": [{"profession": {"name": "Fishing", "id": 356}, "tiers": [
        {"skill_points": 1, "max_skill_points": 75, "known_recipes": []},
    ]}],
}
REPUTATIONS: dict[str, Any] = {"reputations": [
    {"faction": {"name": "Stormwind", "id": 72},
     "standing": {"raw": 42000, "value": 0, "max": 0, "tier": 7, "name": "Exalted"}},
    {"faction": {"name": "Booty Bay", "id": 21},
     "standing": {"raw": 737, "value": 737, "max": 3000, "tier": 3, "name": "Neutral"}},
]}
PVP_SUMMARY: dict[str, Any] = {"honorable_kills": 21, "pvp_rank": 0}
# Killing blows (1487) is left out: never moved = 0.
ACHIEVEMENT_STATISTICS: dict[str, Any] = {"categories": [
    {"id": 21, "name": "Player vs. Player", "statistics": [
        {"id": 1501, "name": "Total deaths from other players", "quantity": 31.0},
    ]},
    {"id": 128, "name": "Kills", "statistics": [{"id": 1197, "name": "Total kills", "quantity": 5999.0}]},
    {"id": 122, "name": "Deaths", "statistics": [{"id": 60, "name": "Total deaths", "quantity": 71.0}]},
    {"id": 14807, "name": "Dungeons & Raids", "sub_categories": [{"id": 14821, "name": "Boss Kills", "statistics": [
        {"id": 63570, "name": "Edwin VanCleef Kills (Deadmines)", "quantity": 2.0},
        {"id": 15027, "name": "Taragaman the Hungerer kills (Ragefire Chasm)", "quantity": 1.0},
    ]}]},
]}


def _profile(**parts: Any) -> CharacterProfile:
    base: dict[str, Any] = {
        "profile": PROFILE, "media": None, "equipment": None, "statistics": None, "specializations": {},
        "professions": PROFESSIONS, "reputations": REPUTATIONS, "pvp_summary": PVP_SUMMARY,
        "achievement_statistics": ACHIEVEMENT_STATISTICS, "mounts": {}, "pets": {},
    }
    return CharacterProfile(**{**base, **parts})


def _fetch(slug: str = "jason-kwon", **parts: Any) -> CharacterFetch:
    profile = _profile(**parts)
    return CharacterFetch(response=to_character_response(slug, profile), profile=profile, fresh=True)


# --- pure ---------------------------------------------------------------------


def test_the_stored_numbers_come_from_the_fetch() -> None:
    fetch = _fetch()
    metrics = to_character_metrics(fetch.response, fetch.profile.achievement_statistics)
    assert (metrics.level, metrics.item_level, metrics.honorable_kills) == (37, 28, 21)
    assert (metrics.total_kills, metrics.total_deaths, metrics.deaths_from_players) == (5999, 71, 31)
    # Absent from Blizzard's answer = never moved.
    assert metrics.killing_blows == 0
    assert metrics.dungeons_done == 2
    assert metrics.exalted_reputations == 1
    assert metrics.professions == (
        CharacterProfessionLevel(profession_id=197, skill=148, max_skill=225),
        CharacterProfessionLevel(profession_id=356, skill=1, max_skill=75),
    )


def test_a_number_blizzard_didnt_send_is_none_not_zero() -> None:
    fetch = _fetch(achievement_statistics=None, pvp_summary=None, reputations=None, professions=None)
    metrics = to_character_metrics(fetch.response, None)
    assert metrics.level == 37
    assert [metrics.killing_blows, metrics.total_kills, metrics.total_deaths, metrics.dungeons_done] == [None] * 4
    assert [metrics.honorable_kills, metrics.deaths_from_players, metrics.exalted_reputations] == [None] * 3
    assert metrics.professions is None


def test_a_section_blizzard_failed_to_send_keeps_the_stored_one() -> None:
    stored = _fetch(mounts={"mounts": [{"mount": {"name": "Brown Horse", "id": 1}}]}).response
    fresh = _fetch(professions=None, pvp_summary=None, achievement_statistics=None, mounts=None).response
    fresh = fresh.model_copy(update={"level": 38})
    merged = merge_sheet(fresh, stored)
    assert merged.level == 38
    assert merged.professions == stored.professions
    assert merged.pvp == stored.pvp
    assert merged.dungeons == stored.dungeons
    assert merged.collections.mounts == stored.collections.mounts
    assert merged.collections.pets == []
    # A section Blizzard sent wins, even when empty.
    assert merge_sheet(_fetch(reputations={}).response, stored).reputations == []
    assert merge_sheet(fresh, None) is fresh


def test_a_stored_sheet_reads_back_only_at_this_version() -> None:
    sheet = _fetch().response
    assert read_sheet(to_sheet_json(sheet), CHARACTER_SHEET_VERSION) == sheet
    assert read_sheet(to_sheet_json(sheet), CHARACTER_SHEET_VERSION + 1) is None


def test_a_stored_sheet_that_no_longer_validates_is_ignored(caplog: pytest.LogCaptureFixture) -> None:
    assert read_sheet({"slug": "jason-kwon"}, CHARACTER_SHEET_VERSION) is None
    assert "no longer validates" in caplog.text


def test_the_sheet_version_moves_with_the_schema() -> None:
    schema = json.dumps(CharacterResponse.model_json_schema(), sort_keys=True).encode()
    assert hashlib.sha256(schema).hexdigest() == SHEET_SCHEMA_HASH, (
        "CharacterResponse changed: bump CHARACTER_SHEET_VERSION if a stored sheet no longer means "
        "the same thing, then update SHEET_SCHEMA_HASH"
    )


# --- stored -------------------------------------------------------------------


async def _rows(db: AsyncSession) -> list[WowCharacter]:
    return list((await db.execute(select(WowCharacter).order_by(WowCharacter.created_at))).scalars())


async def _metric_count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(WowCharacterDailyMetric))).scalar_one()


async def test_a_fetch_stores_the_character_its_sheet_and_todays_numbers(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    fetch = _fetch()
    await character_store_service.record(fetch, now=NOW)

    [row] = await _rows(db)
    assert (row.blizzard_character_id, row.slug, row.name, row.class_id) == (6299749, "jason-kwon", "Jason", 9)
    assert row.fetched_at == NOW and row.gone_at is None
    assert await character_store_service.get_stored("jason-kwon") == fetch.response
    metric = await character_metric_repo.latest(db, row.id)
    assert metric is not None
    assert (metric.day, metric.level, metric.total_kills, metric.killing_blows) == (NOW.date(), 37, 5999, 0)
    skills = await character_metric_repo.profession_skills(db, metric.id)
    assert [(s.profession_id, s.skill, s.max_skill) for s in skills] == [(197, 148, 225), (356, 1, 75)]


async def test_a_second_fetch_that_day_keeps_what_blizzard_failed_to_send(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await character_store_service.record(_fetch(), now=NOW)
    later = _fetch(achievement_statistics=None, professions=None)
    later = CharacterFetch(
        response=later.response.model_copy(update={"level": 38}), profile=later.profile, fresh=True,
    )
    await character_store_service.record(later, now=NOW + timedelta(hours=2))

    [row] = await _rows(db)
    assert await _metric_count(db) == 1
    metric = await character_metric_repo.latest(db, row.id)
    assert metric is not None
    assert (metric.level, metric.total_kills, metric.dungeons_done) == (38, 5999, 2)
    assert len(await character_metric_repo.profession_skills(db, metric.id)) == 2
    stored = await character_store_service.get_stored("jason-kwon")
    assert stored is not None and stored.level == 38
    assert stored.professions is not None and stored.dungeons is not None

    await character_store_service.record(_fetch(), now=NOW + timedelta(days=1))
    assert await _metric_count(db) == 2


async def test_a_renamed_character_keeps_its_row_and_history(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await character_store_service.record(_fetch(), now=NOW)
    await character_store_service.record(_fetch("jason-smith"), now=NOW + timedelta(days=1))

    [row] = await _rows(db)
    assert row.slug == "jason-smith"
    assert await _metric_count(db) == 2
    assert await character_store_service.get_stored("jason-kwon") is None


async def test_a_name_taken_by_a_new_character_marks_the_old_one_gone(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await character_store_service.record(_fetch(), now=NOW)
    await character_store_service.record(
        _fetch(profile={**PROFILE, "id": 7000001, "level": 5}), now=NOW + timedelta(days=1),
    )

    old, new = await _rows(db)
    assert (old.blizzard_character_id, old.gone_at) == (6299749, NOW + timedelta(days=1))
    assert (new.blizzard_character_id, new.gone_at) == (7000001, None)
    stored = await character_store_service.get_stored("jason-kwon")
    assert stored is not None and stored.level == 5


async def test_a_404_marks_a_stored_character_gone_until_blizzard_answers_again(
    bound_unit_of_work: AsyncSession,
) -> None:
    db = bound_unit_of_work
    await character_store_service.record(_fetch(), now=NOW)
    await character_store_service.mark_gone("jason-kwon", now=NOW + timedelta(hours=1))
    [row] = await _rows(db)
    assert row.gone_at == NOW + timedelta(hours=1)
    assert await character_store_service.get_stored("jason-kwon") is None

    await character_store_service.record(_fetch(), now=NOW + timedelta(hours=2))
    await db.refresh(row)
    assert row.gone_at is None


async def test_a_404_or_failure_for_a_name_never_stored_writes_nothing(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await character_store_service.mark_gone("nobody-here", now=NOW)
    await character_store_service.record_failure("nobody-here", "HTTP 503: down", now=NOW)
    assert await _rows(db) == []


async def test_a_failed_fetch_keeps_the_sheet_and_the_error(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await character_store_service.record(_fetch(), now=NOW)
    await character_store_service.record_failure("jason-kwon", "HTTP 503: " + "x" * 900, now=NOW + timedelta(hours=1))
    [row] = await _rows(db)
    assert row.fetched_at == NOW and row.checked_at == NOW + timedelta(hours=1)
    assert row.last_error is not None and row.last_error.startswith("HTTP 503") and len(row.last_error) == 500
    assert await character_store_service.get_stored("jason-kwon") is not None

    await character_store_service.record(_fetch(), now=NOW + timedelta(hours=2))
    await db.refresh(row)
    assert row.last_error is None and row.last_error_at is None


async def test_the_purge_drops_old_days_but_keeps_each_characters_newest(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    long_ago = NOW - timedelta(days=500)
    await character_store_service.record(_fetch(), now=long_ago)
    await character_store_service.record(_fetch(), now=long_ago + timedelta(days=1))
    await character_store_service.record(_fetch(profile={**PROFILE, "id": 1, "name": "Ann", "surname": "Lee"}, slug="ann-lee"), now=long_ago)
    await character_store_service.record(_fetch(profile={**PROFILE, "id": 1, "name": "Ann", "surname": "Lee"}, slug="ann-lee"), now=NOW)

    assert await character_store_service.purge_old_metrics(now=NOW) == 2
    days = sorted((await db.execute(select(WowCharacterDailyMetric.day))).scalars())
    assert days == [(long_ago + timedelta(days=1)).date(), NOW.date()]


# --- the look-up ----------------------------------------------------------------


def _blizzard(profile_status: int = 200) -> BlizzardCharacterClient:
    routes = {
        "/profile/wow/character/jason-kwon": PROFILE,
        "/profile/wow/character/jason-kwon/professions": PROFESSIONS,
        "/profile/wow/character/jason-kwon/reputations": REPUTATIONS,
        "/profile/wow/character/jason-kwon/pvp-summary": PVP_SUMMARY,
        "/profile/wow/character/jason-kwon/achievements/statistics": ACHIEVEMENT_STATISTICS,
    }

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.battle.net":
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 86399})
        body = routes.get(request.url.path)
        if body is None or (profile_status != 200 and request.url.path.endswith("jason-kwon")):
            status = profile_status if profile_status != 200 else 404
            return httpx.Response(status, json={"code": status, "type": f"BLZWEBAPI00000{status}"})
        return httpx.Response(200, json=body)

    return BlizzardCharacterClient("id", "secret", BlizzardTokenCache(), transport=httpx.MockTransport(handle))


@pytest.fixture(autouse=True)
def _clean_caches() -> None:
    character_service.clear_caches()


async def test_a_fresh_look_up_is_stored_and_a_cached_one_is_not(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    monkeypatch.setattr(character_service, "_new_client", lambda: _blizzard())
    sheet = await character_lookup_service.get_character("jason-kwon")
    assert sheet.level == 37
    assert len(await _rows(db)) == 1

    record = AsyncMock()
    monkeypatch.setattr(character_store_service, "record", record)
    await character_lookup_service.get_character("jason-kwon")
    record.assert_not_awaited()


async def test_a_404_look_up_marks_the_stored_character_gone(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    await character_store_service.record(_fetch(), now=NOW)
    monkeypatch.setattr(character_service, "_new_client", lambda: _blizzard(404))
    with pytest.raises(CharacterLookupError):
        await character_lookup_service.get_character("jason-kwon")
    [row] = await _rows(db)
    assert row.gone_at is not None


async def test_a_failed_look_up_records_the_error(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    await character_store_service.record(_fetch(), now=NOW)
    monkeypatch.setattr(character_service, "_new_client", lambda: _blizzard(503))
    with pytest.raises(CharacterLookupError):
        await character_lookup_service.get_character("jason-kwon")
    [row] = await _rows(db)
    assert row.gone_at is None
    assert row.last_error is not None and "503" in row.last_error


async def test_a_storage_failure_still_serves_the_sheet(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(character_service, "_new_client", lambda: _blizzard())
    monkeypatch.setattr(character_store_service, "record", AsyncMock(side_effect=RuntimeError("db down")))
    sheet = await character_lookup_service.get_character("jason-kwon")
    assert sheet.slug == "jason-kwon"
    assert "storing the look-up failed" in caplog.text
