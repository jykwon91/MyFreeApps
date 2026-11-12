"""Stored WoW Forever guilds: membership and recipes on each look-up, and the roster refresh.

Pure: the guild / roster mappers drop anything malformed. Against Postgres:
a look-up stores the character's guild and recipes, only a person's look-up
keeps a guild watched, a rank survives only within the same guild, and the
scheduled refresh (``guild_roster_service``) stores every member, sets ranks,
drops members who left, and never empties a guild on a failure or an
unreadable answer.
"""
from __future__ import annotations

import dataclasses
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_guild import GUILD_NOT_FOUND_ERROR, GUILD_ROSTER_STALE_AFTER, GUILD_TRACKED_FOR
from app.models.wow.character import WowCharacter
from app.models.wow.character_recipe import WowCharacterRecipe
from app.models.wow.guild import WowGuild
from app.models.wow.recipe import WowRecipe
from app.repositories.wow import character_repo, guild_repo, recipe_repo
from app.services.wow.blizzard.blizzard_token_cache import BlizzardTokenCache
from app.services.wow.character import character_lookup_service, character_service, character_store_service
from app.services.wow.character.blizzard_character_client import BlizzardCharacterClient
from app.services.wow.character.character_fetch import CharacterFetch
from app.services.wow.guild import guild_roster_service
from app.services.wow.guild.guild_mapper import to_guild_identity, to_roster
from app.services.wow.guild.guild_refresh_outcome import GuildRefreshOutcome

from wow_guild_fixtures import GUILD, NOW, OTHER_GUILD, make_fetch, professions_json, profile_json


async def _character(db: AsyncSession, slug: str) -> WowCharacter:
    return (await db.execute(select(WowCharacter).where(WowCharacter.slug == slug))).scalar_one()


async def _guild(db: AsyncSession) -> WowGuild:
    return (await db.execute(select(WowGuild).where(WowGuild.blizzard_guild_id == GUILD["id"]))).scalar_one()


async def _known(db: AsyncSession, slug: str) -> set[int]:
    character = await _character(db, slug)
    rows = await db.execute(select(WowCharacterRecipe.recipe_id).where(WowCharacterRecipe.character_id == character.id))
    return set(rows.scalars())


# --- pure ---------------------------------------------------------------------


def test_a_guild_is_read_from_blizzard_or_not_at_all() -> None:
    guild = to_guild_identity(GUILD)
    assert guild is not None and (guild.blizzard_guild_id, guild.slug, guild.faction) == (230059, "topdeadcenter", "ALLIANCE")
    assert to_guild_identity({**GUILD, "slug": "../admin"}) is None
    assert to_guild_identity({**GUILD, "faction": {"type": "NEUTRAL"}}) is None
    assert to_guild_identity({**GUILD, "id": None}) is None
    assert to_guild_identity({**GUILD, "name": "x" * 61}) is None
    assert to_guild_identity(None) is None


def test_a_roster_entry_without_an_id_or_a_sane_rank_is_skipped_and_a_bad_slug_is_kept_by_id() -> None:
    def entry(slug: Any, blizzard_id: Any, rank: Any) -> dict[str, Any]:
        return {"character": {"slug": slug, "id": blizzard_id}, "rank": rank}

    roster = to_roster({"members": [
        entry("tiny-john", 2, 4), entry("bad/slug", 3, 1), entry("no-id", None, 1), entry("no-rank", 4, None),
        entry("too-high", 5, 100), entry("negative", 6, -1),
    ]})
    assert [(m.slug, m.blizzard_character_id, m.rank) for m in roster.members] == [("tiny-john", 2, 4), (None, 3, 1)]
    assert roster.listed == 6
    empty = to_roster({})
    assert (empty.members, empty.listed) == ([], 0)


# --- each look-up ---------------------------------------------------------------


async def test_a_look_up_stores_the_guild_and_joins_it(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    guild = await _guild(db)
    assert (guild.slug, guild.name, guild.faction, guild.last_viewed_at) == ("topdeadcenter", "topdeadcenter", "ALLIANCE", NOW)
    assert (await _character(db, "jason-kwon")).guild_id == guild.id


async def test_only_a_persons_look_up_keeps_a_guild_watched(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await character_store_service.record(make_fetch(), now=NOW)
    assert (await _guild(db)).last_viewed_at is None
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    later = NOW + timedelta(hours=1)
    await character_store_service.record(make_fetch(), now=later)
    assert (await _guild(db)).last_viewed_at == NOW


async def test_leaving_a_guild_clears_membership_and_rank(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    character = await _character(db, "jason-kwon")
    character.guild_rank = 3
    await db.flush()
    await character_store_service.record(make_fetch(), now=NOW)
    assert (await _character(db, "jason-kwon")).guild_rank == 3  # same guild: rank kept

    await character_store_service.record(make_fetch(guild=OTHER_GUILD), now=NOW)
    moved = await _character(db, "jason-kwon")
    assert moved.guild_id != (await _guild(db)).id and moved.guild_rank is None
    await character_store_service.record(make_fetch(guild=None), now=NOW)
    assert (await _character(db, "jason-kwon")).guild_id is None


async def test_known_recipes_are_stored_and_kept_when_blizzard_fails_to_send_them(
    bound_unit_of_work: AsyncSession,
) -> None:
    db = bound_unit_of_work
    await character_store_service.record(make_fetch(professions=professions_json((3915, "Brown Linen Shirt"), (2389, "Red Linen Robe"))), now=NOW)
    assert await _known(db, "jason-kwon") == {3915, 2389}
    names = dict((await db.execute(select(WowRecipe.id, WowRecipe.name))).tuples().all())
    assert names == {3915: "Brown Linen Shirt", 2389: "Red Linen Robe"}

    await character_store_service.record(make_fetch(professions=None), now=NOW)
    assert await _known(db, "jason-kwon") == {3915, 2389}

    await character_store_service.record(make_fetch(professions=professions_json((3915, "Brown Linen Shirt"))), now=NOW)
    assert await _known(db, "jason-kwon") == {3915}
    # Another character knowing the same recipe shares its row.
    await character_store_service.record(
        make_fetch("tiny-john", 2, professions=professions_json((3915, "Brown Linen Shirt"))), now=NOW,
    )
    assert await _known(db, "tiny-john") == {3915}


async def test_a_guild_is_due_while_watched_and_stale(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work

    async def due(at: datetime) -> list[str]:
        rows = await guild_repo.due_for_roster(
            db, viewed_since=at - GUILD_TRACKED_FOR, checked_before=at - GUILD_ROSTER_STALE_AFTER, limit=5,
        )
        return [guild.slug for guild in rows]

    await character_store_service.record(make_fetch(guild=OTHER_GUILD), now=NOW)  # only the scheduler saw it
    await character_store_service.record(make_fetch("tiny-john", 2), now=NOW, viewed=True)
    assert await due(NOW) == ["topdeadcenter"]

    guild = await _guild(db)
    await guild_repo.record_roster(db, guild.id, 1, NOW)
    assert await due(NOW + timedelta(hours=1)) == []
    assert await due(NOW + GUILD_ROSTER_STALE_AFTER + timedelta(minutes=1)) == ["topdeadcenter"]
    assert await due(NOW + GUILD_TRACKED_FOR + timedelta(minutes=1)) == []


# --- the roster refresh ----------------------------------------------------------


def _blizzard(
    members: list[tuple[str, int, int]], *, guild: dict[str, Any] = GUILD, guild_status: int = 200,
    roster: dict[str, Any] | None = None,
) -> BlizzardCharacterClient:
    routes: dict[str, Any] = {
        "/data/wow/guild/topdeadcenter": guild,
        "/data/wow/guild/topdeadcenter/roster": roster if roster is not None else {"members": [
            {"character": {"slug": slug, "id": blizzard_id}, "rank": rank} for slug, blizzard_id, rank in members
        ]},
    }
    for slug, blizzard_id, _ in members:
        routes[f"/profile/wow/character/{slug}"] = profile_json(slug, blizzard_id, GUILD)

    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.battle.net":
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 86399})
        path = request.url.path
        if guild_status != 200 and path.startswith("/data/wow/guild/"):
            return httpx.Response(guild_status, json={"code": guild_status, "type": f"BLZWEBAPI00000{guild_status}"})
        body = routes.get(path)
        if body is None:
            return httpx.Response(404, json={"code": 404, "type": "BLZWEBAPI00000404"})
        return httpx.Response(200, json=body)

    return BlizzardCharacterClient("id", "secret", BlizzardTokenCache(), transport=httpx.MockTransport(handle))


@pytest.fixture(autouse=True)
def _clean_caches() -> None:
    character_service.clear_caches()


@pytest.fixture(autouse=True)
def _one_member_at_a_time(monkeypatch: pytest.MonkeyPatch) -> None:
    # Every unit of work in a test shares one session, which can't run two
    # transactions at once; production gives each member's write its own.
    monkeypatch.setattr(guild_roster_service, "GUILD_MEMBER_FETCH_CONCURRENCY", 1)


async def _watched_guild_with_jason(db: AsyncSession) -> WowGuild:
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    return await _guild(db)


async def test_a_refresh_stores_every_member_with_its_rank_and_drops_who_left(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    guild = await _watched_guild_with_jason(db)
    await character_store_service.record(make_fetch("left-guy", 9), now=NOW)  # stored member no longer on the roster
    monkeypatch.setattr(character_service, "new_client", lambda: _blizzard([("jason-kwon", 1, 0), ("tiny-john", 2, 4)]))

    assert await guild_roster_service.refresh_due(now=NOW) == 1

    await db.refresh(guild)
    assert guild.member_count == 2 and guild.roster_fetched_at is not None and guild.last_error is None
    jason, tiny, left = [await _character(db, s) for s in ("jason-kwon", "tiny-john", "left-guy")]
    assert (jason.guild_id, jason.guild_rank) == (guild.id, 0)
    assert (tiny.guild_id, tiny.guild_rank) == (guild.id, 4)
    assert (left.guild_id, left.guild_rank) == (None, None)
    # The scheduler's look-ups don't keep the guild watched.
    assert guild.last_viewed_at == NOW


async def test_a_guild_blizzard_404s_twice_is_gone_and_its_members_leave(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    guild = await _watched_guild_with_jason(db)
    monkeypatch.setattr(character_service, "new_client", lambda: _blizzard([], guild_status=404))
    await guild_roster_service.refresh_guild(guild, budget=50, now=NOW)
    await db.refresh(guild)
    # One 404 can be Blizzard's hiccup: the guild stays until a second one in a row.
    assert guild.gone_at is None and guild.last_error == GUILD_NOT_FOUND_ERROR
    assert (await _character(db, "jason-kwon")).guild_id == guild.id
    await guild_roster_service.refresh_guild(guild, budget=50, now=NOW)
    await db.refresh(guild)
    assert guild.gone_at is not None
    assert (await _character(db, "jason-kwon")).guild_id is None


async def test_a_name_given_to_another_guild_marks_ours_gone(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    guild = await _watched_guild_with_jason(db)
    monkeypatch.setattr(
        character_service, "new_client", lambda: _blizzard([("tiny-john", 2, 0)], guild={**GUILD, "id": 777}),
    )
    await guild_roster_service.refresh_guild(guild, budget=50, now=NOW)
    await db.refresh(guild)
    assert guild.gone_at is not None
    assert (await _character(db, "jason-kwon")).guild_id is None


@pytest.mark.parametrize("failure", ["blizzard_down", "unreadable_roster"])
async def test_a_failed_or_unreadable_refresh_keeps_the_roster(
    failure: str, bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    guild = await _watched_guild_with_jason(db)
    client = (
        (lambda: _blizzard([], guild_status=503)) if failure == "blizzard_down"
        else (lambda: _blizzard([], roster={"members": "nope"}))
    )
    monkeypatch.setattr(character_service, "new_client", client)
    await guild_roster_service.refresh_guild(guild, budget=50, now=NOW)
    await db.refresh(guild)
    assert guild.gone_at is None and guild.last_error is not None and guild.roster_checked_at is not None
    assert (await _character(db, "jason-kwon")).guild_id == guild.id


async def test_a_member_that_fails_is_skipped_and_the_rest_are_stored(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    guild = await _watched_guild_with_jason(db)
    # tiny-john is on the roster but Blizzard has no profile for it.
    roster = {"members": [
        {"character": {"slug": "jason-kwon", "id": 1}, "rank": 0},
        {"character": {"slug": "tiny-john", "id": 2}, "rank": 4},
    ]}
    monkeypatch.setattr(character_service, "new_client", lambda: _blizzard([("jason-kwon", 1, 0)], roster=roster))
    await guild_roster_service.refresh_guild(guild, budget=50, now=NOW)
    await db.refresh(guild)
    assert guild.member_count == 2
    assert (await _character(db, "jason-kwon")).guild_rank == 0
    assert (await db.execute(select(WowCharacter).where(WowCharacter.slug == "tiny-john"))).scalar_one_or_none() is None


async def test_a_partly_unreadable_roster_keeps_the_members_it_lists_by_id(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    guild = await _watched_guild_with_jason(db)
    roster = {"members": [
        {"character": {"slug": "Jason Kwon!", "id": 1}, "rank": 2},  # a slug we can't use: kept by id
        {"character": {"slug": "tiny-john", "id": 2}, "rank": 4},
    ]}
    monkeypatch.setattr(character_service, "new_client", lambda: _blizzard([("tiny-john", 2, 4)], roster=roster))
    await guild_roster_service.refresh_guild(guild, budget=50, now=NOW)
    jason = await _character(db, "jason-kwon")
    assert (jason.guild_id, jason.guild_rank) == (guild.id, 2)


async def test_a_mostly_unreadable_roster_is_not_applied(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    guild = await _watched_guild_with_jason(db)
    roster = {"members": [{"character": {"slug": "tiny-john", "id": 2}, "rank": 4}, {"bad": 1}, {"bad": 2}]}
    monkeypatch.setattr(character_service, "new_client", lambda: _blizzard([("tiny-john", 2, 4)], roster=roster))
    await guild_roster_service.refresh_guild(guild, budget=50, now=NOW)
    await db.refresh(guild)
    assert guild.last_error is not None
    assert (await _character(db, "jason-kwon")).guild_id == guild.id


async def test_members_refreshed_lately_are_not_fetched_and_the_run_keeps_to_its_budget(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    await _watched_guild_with_jason(db)  # jason was stored at NOW: not fetched again
    members = [("jason-kwon", 1, 0), ("tiny-john", 2, 4), ("big-bob", 3, 5)]
    monkeypatch.setattr(character_service, "new_client", lambda: _blizzard(members))
    monkeypatch.setattr(guild_roster_service, "GUILD_ROSTER_MAX_MEMBER_FETCHES_PER_RUN", 1)
    fetched: list[str] = []
    real_get = character_lookup_service.get_character

    async def spy(slug: str, *, viewed: bool = True) -> Any:
        fetched.append(slug)
        return await real_get(slug, viewed=viewed)

    monkeypatch.setattr(character_lookup_service, "get_character", spy)
    await guild_roster_service.refresh_due(now=NOW)
    assert fetched == ["tiny-john"]


async def test_one_guild_failing_unexpectedly_is_recorded_and_the_next_still_refreshes(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    await character_store_service.record(make_fetch("tiny-john", 2, guild=OTHER_GUILD), now=NOW, viewed=True)
    calls: list[str] = []

    async def first_one_breaks(guild: WowGuild, *, budget: int, now: datetime | None = None) -> GuildRefreshOutcome:
        calls.append(guild.slug)
        if len(calls) == 1:
            raise KeyError("a bug")
        return GuildRefreshOutcome(fetched=0, rate_limited=False)

    monkeypatch.setattr(guild_roster_service, "refresh_guild", first_one_breaks)
    assert await guild_roster_service.refresh_due(now=NOW) == 2
    assert len(calls) == 2
    broken = (await db.execute(select(WowGuild).where(WowGuild.slug == calls[0]))).scalar_one()
    await db.refresh(broken)
    assert broken.last_error is not None and broken.roster_checked_at is not None


async def test_a_429_from_blizzard_ends_the_run(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    await character_store_service.record(make_fetch("tiny-john", 2, guild=OTHER_GUILD), now=NOW, viewed=True)
    monkeypatch.setattr(character_service, "new_client", lambda: _blizzard([], guild_status=429))
    assert await guild_roster_service.refresh_due(now=NOW) == 1
    checked = (await db.execute(select(WowGuild).where(WowGuild.roster_checked_at.is_not(None)))).scalars().all()
    assert len(checked) == 1


async def test_a_look_up_served_from_the_cache_still_keeps_the_guild_watched(
    bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    await character_store_service.record(make_fetch(), now=NOW)  # stored by the scheduler only
    assert (await _guild(db)).last_viewed_at is None
    cached = dataclasses.replace(make_fetch(), fresh=False)

    async def from_cache(slug: str) -> CharacterFetch:
        return cached

    monkeypatch.setattr(character_service, "fetch_character", from_cache)
    await character_lookup_service.get_character("jason-kwon")
    guild = await _guild(db)
    await db.refresh(guild)
    assert guild.last_viewed_at is not None


async def test_a_recipe_id_sent_twice_is_stored_once(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await recipe_repo.upsert_recipes(db, [(3915, 197, "Brown Linen Shirt"), (3915, 197, "Brown Linen Shirt (old)")])
    assert (await db.execute(select(WowRecipe.name))).scalars().all() == ["Brown Linen Shirt (old)"]


async def test_an_empty_roster_is_refused_by_the_repository(bound_unit_of_work: AsyncSession) -> None:
    guild = await _watched_guild_with_jason(bound_unit_of_work)
    with pytest.raises(ValueError):
        await character_repo.apply_roster(bound_unit_of_work, guild.id, {})
