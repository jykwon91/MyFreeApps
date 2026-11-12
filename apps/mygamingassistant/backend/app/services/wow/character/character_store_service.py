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
  the day's earlier value, and the profession skills are replaced only when
  Blizzard sent the professions.

A 404 marks a stored character gone (nothing is stored for a name Blizzard
never answered); any other failure only records ``last_error``. Daily rows
older than ``CHARACTER_METRIC_RETENTION`` are purged daily
(``purge_wow_character_metrics``), each character's newest kept.
"""
from __future__ import annotations

import dataclasses
import logging
from datetime import datetime, timezone

from app.core.wow_character import CHARACTER_ERROR_MAX_LENGTH, CHARACTER_METRIC_RETENTION, CHARACTER_SHEET_VERSION
from app.db.session import unit_of_work
from app.repositories.wow import character_metric_repo, character_repo
from app.schemas.wow.character.character_response import CharacterResponse
from app.services.wow.character.character_fetch import CharacterFetch
from app.services.wow.character.character_json import as_int
from app.services.wow.character.character_metrics_mapper import to_character_metrics
from app.services.wow.character.character_sheet_codec import read_sheet, to_sheet_json
from app.services.wow.character.character_sheet_merge import merge_sheet

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def record(fetch: CharacterFetch, *, now: datetime | None = None) -> None:
    """Store a fresh fetch: the character, its merged sheet and today's numbers."""
    at = now or _now()
    blizzard_id = as_int(fetch.profile.profile.get("id"))
    if blizzard_id is None:
        logger.warning("Character %s not stored: Blizzard's profile has no id", fetch.response.slug)
        return
    fresh = fetch.response
    async with unit_of_work() as db:
        await character_repo.lock_character(db, blizzard_id)
        row = await character_repo.get_by_blizzard_id(db, blizzard_id)
        holder = await character_repo.get_live_by_slug(db, fresh.slug)
        if holder is not None and holder.blizzard_character_id != blizzard_id:
            await character_repo.mark_gone(db, holder, at)
        stored = None if row is None else read_sheet(row.sheet, row.sheet_version)
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
        })
        metrics = to_character_metrics(fresh, fetch.profile.achievement_statistics)
        values = {f.name: getattr(metrics, f.name) for f in dataclasses.fields(metrics) if f.name != "professions"}
        metric_id = await character_metric_repo.upsert_daily(db, row.id, at.date(), values)
        if metrics.professions is not None:
            await character_metric_repo.replace_profession_skills(
                db, metric_id, [(p.profession_id, p.skill, p.max_skill) for p in metrics.professions],
            )


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
