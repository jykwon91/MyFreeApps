"""Import a published lineup-library pack into the database.

The symmetric IMPORT half of :mod:`app.services.game.lineup_exporter`. Unlike
the export runner this ships in the app image, so prod seeds its read-only
library with:

    docker compose exec api python -m app.cli import-lineups

The pack is baked into the image at ``/app/data/lineup_library.json`` (the
committed ``apps/mygamingassistant/backend/data/lineup_library.json`` — it
lives UNDER ``backend/`` so the backend Dockerfile's ``COPY .../backend/ /app/``
carries it in; a sibling ``apps/mygamingassistant/data/`` would NOT ship).
An explicit path argument overrides the baked default.

Resolution model (see :mod:`app.services.game.lineup_exporter` for the why):
``load-fixtures`` runs first, so game / map / utility / zone slugs already
exist with prod-side ``uuid4`` PKs. This importer resolves each pack lineup's
FK SLUGS to those prod UUIDs, upserts the referenced zones (publishing
operator-refined polygons via ``force_polygon=True``) and sources (by verbatim
id), then upserts each lineup by verbatim id. The whole pack imports inside ONE
``unit_of_work`` transaction — atomic: a malformed pack rolls the entire
library back rather than leaving prod half-populated. Idempotent + re-runnable
(re-import after a clip re-publish or pack refresh converges).
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.repositories.game import game_repo, source_repo
from app.repositories.game.lineup import upsert_imported_lineup
from app.services.game.lineup_exporter import LINEUP_SCALAR_FIELDS, PACK_VERSION

logger = logging.getLogger(__name__)

# Baked into the image by the backend Dockerfile (``COPY .../backend/ /app/``),
# so ``parents[3]`` is ``/app`` in the container and the backend dir locally:
#   .../app/services/game/lineup_importer.py
#   parents[0]=game parents[1]=services parents[2]=app parents[3]=<backend root>
_DEFAULT_PACK_PATH = (
    Path(__file__).resolve().parents[3] / "data" / "lineup_library.json"
)


class PackError(Exception):
    """The pack is unusable — wrong version, or references an unseeded slug.

    Raised (not logged-and-skipped) so a bad pack aborts the whole import
    transaction; partial libraries are worse than a clear failure the operator
    can act on (run ``load-fixtures``, rebuild the pack, etc.).
    """


@dataclass
class ImportStats:
    zones_upserted: int = 0
    sources_upserted: int = 0
    lineups_upserted: int = 0

    def summary(self) -> str:
        return (
            f"Imported {self.lineups_upserted} lineup(s), "
            f"{self.zones_upserted} zone(s), {self.sources_upserted} source(s)."
        )


def _require_zone(
    zone_id_by_key: dict[tuple[str, str, str], uuid.UUID],
    lineup: dict,
    slug_key: str,
) -> uuid.UUID:
    """Resolve a lineup's zone slug to the prod zone UUID, or fail loud.

    ``build_pack`` always carries every referenced zone in ``pack["zones"]``,
    so a miss means a hand-edited or truncated pack — abort rather than create
    a lineup with a dangling FK.
    """
    slug = lineup[slug_key]
    key = (lineup["game_slug"], lineup["map_slug"], slug)
    zone_id = zone_id_by_key.get(key)
    if zone_id is None:
        raise PackError(
            f"lineup {lineup['id']} references {slug_key}={slug!r} "
            f"(map {lineup['map_slug']!r}) which is not in pack['zones']"
        )
    return zone_id


async def import_pack(db: AsyncSession, pack: dict) -> ImportStats:
    """Upsert an entire pack into *db* (flush-only; caller owns the commit).

    Used directly by the round-trip test (against a transactional session) and
    via :func:`import_lineups_standalone` (which wraps it in ``unit_of_work``).
    """
    version = pack.get("version")
    if version != PACK_VERSION:
        raise PackError(
            f"pack version {version!r} != supported {PACK_VERSION!r}; "
            "rebuild the pack (export_lineup_pack.py) or upgrade the app."
        )

    stats = ImportStats()
    game_cache: dict[str, object] = {}
    map_cache: dict[tuple[str, str], object] = {}
    zone_id_by_key: dict[tuple[str, str, str], uuid.UUID] = {}

    async def _resolve_game(slug: str):
        if slug not in game_cache:
            game = await game_repo.get_game_by_slug(db, slug)
            if game is None:
                raise PackError(
                    f"game slug {slug!r} not found — run load-fixtures before import."
                )
            game_cache[slug] = game
        return game_cache[slug]

    async def _resolve_map(game_slug: str, map_slug: str):
        key = (game_slug, map_slug)
        if key not in map_cache:
            game = await _resolve_game(game_slug)
            map_obj = await game_repo.get_map_by_slug(db, game.id, map_slug)
            if map_obj is None:
                raise PackError(
                    f"map slug {map_slug!r} (game {game_slug!r}) not found — "
                    "run load-fixtures before import."
                )
            map_cache[key] = map_obj
        return map_cache[key]

    # 1) Sources — verbatim id (not fixtures, no slug indirection).
    for src in pack.get("sources", []):
        await source_repo.upsert_source(
            db,
            source_id=uuid.UUID(src["id"]),
            kind=src["kind"],
            config_json=src.get("config_json") or {},
        )
        stats.sources_upserted += 1

    # 2) Zones — upsert (publishing operator-refined polygons) and build the
    #    (game_slug, map_slug, zone_slug) → prod-UUID lookup the lineups need.
    for zone in pack.get("zones", []):
        map_obj = await _resolve_map(zone["game_slug"], zone["map_slug"])
        upserted = await game_repo.upsert_map_zone(
            db,
            map_id=map_obj.id,
            slug=zone["zone_slug"],
            name=zone["name"],
            polygon_points=zone.get("polygon_points") or [],
            force_polygon=True,
        )
        zone_id_by_key[
            (zone["game_slug"], zone["map_slug"], zone["zone_slug"])
        ] = upserted.id
        stats.zones_upserted += 1

    # 3) Lineups — resolve FK slugs → prod UUIDs, upsert by verbatim id.
    for lineup in pack.get("lineups", []):
        game = await _resolve_game(lineup["game_slug"])
        map_obj = await _resolve_map(lineup["game_slug"], lineup["map_slug"])
        util = await game_repo.get_utility_type_by_slug(
            db, game.id, lineup["utility_type_slug"]
        )
        if util is None:
            raise PackError(
                f"utility slug {lineup['utility_type_slug']!r} "
                f"(game {lineup['game_slug']!r}) not found — "
                "run load-fixtures before import."
            )

        fields: dict = {
            "game_id": game.id,
            "map_id": map_obj.id,
            "target_zone_id": _require_zone(zone_id_by_key, lineup, "target_zone_slug"),
            "stand_zone_id": _require_zone(zone_id_by_key, lineup, "stand_zone_slug"),
            "utility_type_id": util.id,
            "source_id": (
                uuid.UUID(lineup["source_id"]) if lineup.get("source_id") else None
            ),
        }
        # Public scalar columns travel verbatim (same list the exporter wrote).
        for scalar in LINEUP_SCALAR_FIELDS:
            fields[scalar] = lineup.get(scalar)

        await upsert_imported_lineup(
            db, lineup_id=uuid.UUID(lineup["id"]), fields=fields
        )
        stats.lineups_upserted += 1

    return stats


async def import_lineups_standalone(path: Optional[str] = None) -> ImportStats:
    """Load a pack file and import it in its own ``unit_of_work``. Used by the CLI.

    *path* defaults to the image-baked pack; pass an explicit path to import a
    different file (ops / testing). The single ``unit_of_work`` makes the whole
    import atomic — a ``PackError`` partway through rolls everything back.
    """
    pack_path = Path(path) if path else _DEFAULT_PACK_PATH
    if not pack_path.is_file():
        raise PackError(f"pack file not found: {pack_path}")

    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    logger.info(
        "lineup_importer: importing pack %s (%d lineups)",
        pack_path,
        len(pack.get("lineups", [])),
    )
    async with unit_of_work() as db:
        stats = await import_pack(db, pack)
    logger.info("lineup_importer: %s", stats.summary())
    return stats
