"""Build a portable, prod-reproducible pack of the accepted lineup library.

The serve-only prod deploy (Cloudflare R2 + read-only library — see
``memory/project_mga_prod_storage_r2.md``) is seeded from a committed JSON
pack rather than a DB dump: ``load-fixtures`` upserts game/map/zone/utility
with non-deterministic ``uuid4`` PKs, so local and prod zone UUIDs differ.
The pack therefore carries lineup FKs as **slugs** (game / map / target-zone
/ stand-zone / utility) and the importer (:mod:`app.services.game.lineup_importer`)
resolves slug→prod-UUID. The lineup's and source's OWN UUIDs travel
**verbatim** — they are not fixtures, so their PKs never collide and
re-import by id is idempotent.

This module is the EXPORT half (the importer is the symmetric IMPORT half).
The local runner ``scripts/export_lineup_pack.py`` is a thin wrapper that
opens a session, calls :func:`build_pack`, and writes the JSON file; keeping
the logic here (committed) lets the round-trip test exercise a real
export→import in CI, where the untracked ``scripts/`` dir does not exist.

Excluded from the pack (deliberately — mirrors the public read shape in
``lineup_service._build_read``): the operator-only ``*_original`` /
``*_trim_*`` / ``*_offset_s`` clip-editor state, the ``suggested_*`` /
``classification_*`` review-queue columns, and the
``stand_ts`` / ``aim_ts`` / ``*_localized_at`` localization-authoring state.
None of those are needed to SERVE a finished, accepted lineup; shipping them
would leak pre-trim frames or stale authoring state to prod.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game.lineup import Lineup

# Bump when the pack shape changes in a way the importer must branch on. The
# importer validates this so an old binary can't silently mis-read a newer pack.
PACK_VERSION = 1

# Public scalar columns copied verbatim into each pack lineup — the subset of
# the ``LineupRead`` shape that is neither an FK id (carried as a slug) nor
# operator-only authoring state. ``side`` is a scalar enum string, so it lives
# here rather than with the resolved FK slugs.
LINEUP_SCALAR_FIELDS: tuple[str, ...] = (
    "title",
    "notes",
    "side",
    "stand_screenshot_url",
    "aim_screenshot_url",
    "landing_screenshot_url",
    "clip_url",
    "landing_clip_url",
    "stand_clip_url",
    "aim_clip_url",
    "aim_anchor_x",
    "aim_anchor_y",
    "stand_anchor_x",
    "stand_anchor_y",
    "target_anchor_x",
    "target_anchor_y",
    "setup_seconds",
    "technique",
    "youtube_video_id",
    "chapter_start_seconds",
    "chapter_title",
    "attribution_url",
    "attribution_author",
)

# The 7 public object keys ``publish_clips_to_r2`` ships from local MinIO → R2.
# One source of truth shared by the publish script (and any verifier) so the
# set can't drift from what the read path signs in ``lineup_service``.
PUBLIC_OBJECT_KEY_FIELDS: tuple[str, ...] = (
    "stand_screenshot_url",
    "aim_screenshot_url",
    "landing_screenshot_url",
    "clip_url",
    "landing_clip_url",
    "stand_clip_url",
    "aim_clip_url",
)


class MalformedAcceptedLineup(Exception):
    """An accepted lineup is missing an FK the CHECK constraint should guarantee."""


async def build_pack(db: AsyncSession) -> dict:
    """Return the full accepted-lineup library as a JSON-serializable pack dict.

    Deterministic: zones and sources are sorted by their natural keys, lineups
    by ``(youtube_video_id, chapter_start_seconds, id)``, and no timestamp is
    embedded — so re-running against unchanged data yields a byte-identical
    file (no spurious git churn in the committed ``data/lineup_library.json``).

    Raises :class:`MalformedAcceptedLineup` if any accepted row is missing a
    classification FK (the ``ck_lineup_accepted_classified`` CHECK should make
    this impossible; failing loud beats shipping an unresolvable lineup).
    """
    rows = (
        (
            await db.execute(
                select(Lineup)
                .where(Lineup.status == "accepted")
                .options(
                    selectinload(Lineup.game),
                    selectinload(Lineup.map),
                    selectinload(Lineup.target_zone),
                    selectinload(Lineup.stand_zone),
                    selectinload(Lineup.utility_type),
                    selectinload(Lineup.source),
                )
                .order_by(
                    Lineup.youtube_video_id,
                    Lineup.chapter_start_seconds,
                    Lineup.id,
                )
            )
        )
        .scalars()
        .all()
    )

    # Dedup referenced zones by (game_slug, map_slug, zone_slug) and sources by
    # id so the pack carries each once even when many lineups share them.
    zones: dict[tuple[str, str, str], dict] = {}
    sources: dict[str, dict] = {}
    lineups_out: list[dict] = []

    for lineup in rows:
        missing = [
            attr
            for attr in ("game", "map", "target_zone", "stand_zone", "utility_type")
            if getattr(lineup, attr) is None
        ]
        if lineup.side is None:
            missing.append("side")
        if missing:
            raise MalformedAcceptedLineup(
                f"accepted lineup {lineup.id} ({lineup.title!r}) is missing: "
                + ", ".join(missing)
            )

        game_slug = lineup.game.slug
        map_slug = lineup.map.slug

        for zone in (lineup.target_zone, lineup.stand_zone):
            zones[(game_slug, map_slug, zone.slug)] = {
                "game_slug": game_slug,
                "map_slug": map_slug,
                "zone_slug": zone.slug,
                "name": zone.name,
                "polygon_points": zone.polygon_points or [],
            }

        if lineup.source is not None:
            sources[str(lineup.source.id)] = {
                "id": str(lineup.source.id),
                "kind": lineup.source.kind,
                "config_json": lineup.source.config_json or {},
            }

        entry: dict = {
            "id": str(lineup.id),
            "game_slug": game_slug,
            "map_slug": map_slug,
            "target_zone_slug": lineup.target_zone.slug,
            "stand_zone_slug": lineup.stand_zone.slug,
            "utility_type_slug": lineup.utility_type.slug,
            "source_id": str(lineup.source_id) if lineup.source_id else None,
        }
        for field in LINEUP_SCALAR_FIELDS:
            entry[field] = getattr(lineup, field)
        lineups_out.append(entry)

    return {
        "version": PACK_VERSION,
        "lineup_count": len(lineups_out),
        "zones": sorted(
            zones.values(),
            key=lambda z: (z["game_slug"], z["map_slug"], z["zone_slug"]),
        ),
        "sources": sorted(sources.values(), key=lambda s: s["id"]),
        "lineups": lineups_out,
    }
