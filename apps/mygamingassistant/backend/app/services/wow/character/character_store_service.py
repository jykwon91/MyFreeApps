"""Store looked-up WoW Forever characters: their last sheet and a daily history of their numbers.

Written after every fresh Blizzard fetch on "Your character"
(``character_lookup_service``), each write one short transaction after the
Blizzard calls are done, so no database connection is held while Blizzard
answers. Per fetch, under a per-character advisory lock:

* the character row is found by Blizzard's character id. A renamed character
  moves to its new slug and keeps its history; a different live character
  stored under the slug is marked gone first (Blizzard gave its name away);
* the sheet is the fresh one, with any section Blizzard failed to send this
  time kept from the stored sheet (``merge_sheet``);
* that UTC day's numbers are upserted, a number Blizzard didn't send keeping
  the day's earlier value, and the profession skills and known recipes are
  replaced only when Blizzard sent the professions;
* the character's guild is stored (``wow_guild``) first, in its own short
  transaction so concurrent members of one guild don't queue on its row, and
  the character joins it; its rank stays only while the guild is the same (the
  roster refresh sets it). A look-up on a page (``viewed``) keeps the guild's
  roster refreshed, also when the page was served from the cache
  (``record_view``).

A 404 marks a stored character gone (nothing is stored for a name Blizzard
never answered); any other failure only records ``last_error``. Daily rows
older than ``CHARACTER_METRIC_RETENTION`` are purged daily
(``purge_wow_character_metrics``), each character's newest kept.
"""
from __future__ import annotations

import dataclasses
import logging
import uuid
from datetime import datetime, timezone

from app.core.wow_character import (
    CHARACTER_ERROR_MAX_LENGTH,
    CHARACTER_METRIC_RETENTION,
    CHARACTER_SHEET_VERSION,
    RECIPE_NAME_MAX_LENGTH,
)
from app.db.session import unit_of_work
from app.repositories.wow import character_metric_repo, character_repo, guild_repo, recipe_repo
from app.schemas.wow.character.character_response import CharacterResponse
from app.services.wow.character.character_fetch import CharacterFetch
from app.services.wow.character.character_json import as_int
from app.services.wow.character.character_metrics_mapper import to_character_metrics
from app.services.wow.character.character_sheet_codec import read_sheet, to_sheet_json
from app.services.wow.character.character_sheet_merge import merge_sheet
from app.services.wow.guild.guild_mapper import to_guild_identity

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def record(fetch: CharacterFetch, *, now: datetime | None = None, viewed: bool = False) -> None:
    """Store a fresh fetch: the character, its guild, its merged sheet, today's
    numbers and its recipes. ``viewed``: a person looked it up on a page."""
    at = now or _now()
    blizzard_id = as_int(fetch.profile.profile.get("id"))
    if blizzard_id is None:
        logger.warning("Character %s not stored: Blizzard's profile has no id", fetch.response.slug)
        return
    fresh = fetch.response
    guild_id = await _store_guild(fetch, at, viewed)
    async with unit_of_work() as db:
        await character_repo.lock_character(db, blizzard_id)
        await character_repo.mark_slug_taken(db, fresh.slug, blizzard_id, at)
        row = await character_repo.get_by_blizzard_id(db, blizzard_id)
        stored = None if row is None else read_sheet(row.sheet, row.sheet_version)
        same_guild = row is not None and guild_id is not None and row.guild_id == guild_id
        row = await character_repo.save_fetched(db, row, {
            "blizzard_character_id": blizzard_id,
            "slug": fresh.slug,
            "name": fresh.name,
            "surname": fresh.surname,
            "class_id": fresh.class_id,
            "sheet": to_sheet_json(merge_sheet(fresh, stored)),
            "sheet_version": CHARACTER_SHEET_VERSION,
            "fetched_at": at,
            "checked_at": at,
            "last_error": None,
            "last_error_at": None,
            "gone_at": None,
            "guild_id": guild_id,
            "guild_rank": row.guild_rank if same_guild else None,
        })
        metrics = to_character_metrics(fresh, fetch.profile.achievement_statistics)
        values = {f.name: getattr(metrics, f.name) for f in dataclasses.fields(metrics) if f.name != "professions"}
        metric_id = await character_metric_repo.upsert_daily(db, row.id, at.date(), values)
        if metrics.professions is not None:
            await character_metric_repo.replace_profession_skills(
                db, metric_id, [(p.profession_id, p.skill, p.max_skill) for p in metrics.professions],
            )
        if fresh.professions is not None:
            known = [
                (recipe.id, profession.id, recipe.name[:RECIPE_NAME_MAX_LENGTH])
                for profession in (*fresh.professions.primaries, *fresh.professions.secondaries)
                for recipe in profession.recipes
            ]
            await recipe_repo.upsert_recipes(db, known)
            await recipe_repo.replace_character_recipes(db, row.id, [recipe_id for recipe_id, _, _ in known])


async def _store_guild(fetch: CharacterFetch, at: datetime, viewed: bool) -> uuid.UUID | None:
    guild = to_guild_identity(fetch.profile.profile.get("guild"))
    if guild is None:
        return None
    async with unit_of_work() as db:
        return await guild_repo.upsert(
            db,
            blizzard_guild_id=guild.blizzard_guild_id,
            slug=guild.slug,
            name=guild.name,
            faction=guild.faction,
            at=at,
            viewed=viewed,
        )


async def record_view(fetch: CharacterFetch, *, now: datetime | None = None) -> None:
    """A person looked up a character served from the cache: keep its guild watched."""
    guild = to_guild_identity(fetch.profile.profile.get("guild"))
    if guild is None:
        return
    async with unit_of_work() as db:
        await guild_repo.touch_viewed(db, guild.blizzard_guild_id, now or _now())


async def mark_gone(slug: str, *, now: datetime | None = None) -> None:
    """Blizzard has no character by this name: mark the stored one gone, if any."""
    async with unit_of_work() as db:
        if await character_repo.mark_live_slug_gone(db, slug, now or _now()):
            logger.info("Stored character %s is gone: Blizzard has no character by that name", slug)


async def record_failure(slug: str, message: str, *, now: datetime | None = None) -> None:
    """A failed fetch of a stored character: its sheet stays, the error is kept."""
    async with unit_of_work() as db:
        await character_repo.record_error(db, slug, message[:CHARACTER_ERROR_MAX_LENGTH], now or _now())


async def get_stored(slug: str) -> CharacterResponse | None:
    """The live character's stored sheet, or None (never stored, gone, or of another sheet version)."""
    async with unit_of_work() as db:
        row = await character_repo.get_live_by_slug(db, slug)
        return None if row is None else read_sheet(row.sheet, row.sheet_version)


async def purge_old_metrics(*, now: datetime | None = None) -> int:
    """Delete daily rows older than ``CHARACTER_METRIC_RETENTION`` (each character's newest kept)."""
    cutoff = ((now or _now()) - CHARACTER_METRIC_RETENTION).date()
    async with unit_of_work() as db:
        deleted = await character_metric_repo.delete_before(db, cutoff)
    logger.info("wow characters: purged %d daily rows older than %s", deleted, cutoff.isoformat())
    return deleted
