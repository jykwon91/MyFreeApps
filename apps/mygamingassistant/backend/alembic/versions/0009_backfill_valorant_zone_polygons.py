"""Backfill Valorant map-zone polygons from the fixture for existing DBs

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-17 00:00:01.000000

Companion to 0008 (which did the same for CS2). Ships the Valorant
web-library geometry as part of the partial unpause of PR 11 — Valorant
*plan-mode* only; Valorant *live screen-capture detection* stays paused.

Before this series, ``valorant_maps.json`` carried 69 zones with empty
``polygon_points`` and was deliberately gated OUT of ``_SEEDED_MAP_FIXTURES``
(no centroid -> ``LineupRead.effective_*`` is ``None`` -> every Valorant
lineup is unplaceable, so the honest fix was to not seed broken content).
The same PR as this migration authors approximate seed polygons for all 69
zones inline in the fixture and adds the file to the seed set. ``load_fixtures``
is CLI-only — it does NOT run in the app lifespan — so an already-deployed
database (one that had Valorant maps seeded by an earlier loader run before
the gate landed) would never receive the polygons. This migration walks the
fixture and writes its polygon onto every Valorant zone whose stored
``polygon_points`` is empty.

Conservative + idempotent (identical posture to 0008):
- Only zones joined to a ``game`` with ``slug = 'valorant'`` are touched.
- Only rows whose ``polygon_points`` is NULL or a zero-length JSON array
  are updated — a zone an operator already refined via the #656 editor (or
  one already backfilled) is NEVER overwritten.
- Re-running selects nothing once polygons are populated.
- A clean deploy with no Valorant rows yet is a no-op; the loader seeds the
  populated fixture directly.

Downgrade is intentionally a no-op — see 0008's module docstring for the
full rationale (an approximate polygon is valid input for older code too;
restoring "empty" would re-break pin placement).
"""
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def _load_valorant_fixture() -> list[dict]:
    """Resolve and parse ``app/fixtures/valorant_maps.json`` independent of CWD.

    This file lives at ``alembic/versions/0009_*.py``; ``parents[2]`` is the
    backend root, mirroring how ``fixture_loader`` resolves its fixtures dir.
    """
    fixture_path = (
        Path(__file__).resolve().parents[2]
        / "app"
        / "fixtures"
        / "valorant_maps.json"
    )
    with fixture_path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _fixture_polygons() -> dict[tuple[str, str], list]:
    """Flatten the fixture into ``{(map_slug, zone_slug): polygon_points}``.

    Only non-empty polygons are included — there is nothing to backfill from
    an empty fixture entry.
    """
    out: dict[tuple[str, str], list] = {}
    for entry in _load_valorant_fixture():
        if entry.get("game_slug") != "valorant":
            continue
        for m in entry.get("maps", []):
            for z in m.get("zones", []):
                points = z.get("polygon_points") or []
                if points:
                    out[(m["slug"], z["slug"])] = points
    return out


def upgrade() -> None:
    bind = op.get_bind()

    game = sa.table("game", sa.column("id", sa.String), sa.column("slug", sa.String))
    mp = sa.table(
        "map",
        sa.column("id", sa.String),
        sa.column("game_id", sa.String),
        sa.column("slug", sa.String),
    )
    map_zone = sa.table(
        "map_zone",
        sa.column("id", sa.String),
        sa.column("map_id", sa.String),
        sa.column("slug", sa.String),
        sa.column("polygon_points", postgresql.JSONB),
    )

    # Empty == NULL OR a zero-length array. The real column is JSONB
    # (created by migration 0001 as postgresql.JSONB with server_default
    # '[]'); use the jsonb_* functions. The type guard keeps the length
    # check from raising on a non-array value.
    is_empty = sa.or_(
        map_zone.c.polygon_points.is_(None),
        sa.text(
            "(jsonb_typeof(map_zone.polygon_points) = 'array' "
            "AND jsonb_array_length(map_zone.polygon_points) = 0)"
        ),
    )

    rows = bind.execute(
        sa.select(
            map_zone.c.id,
            mp.c.slug.label("map_slug"),
            map_zone.c.slug.label("zone_slug"),
        )
        .select_from(
            map_zone.join(mp, map_zone.c.map_id == mp.c.id).join(
                game, mp.c.game_id == game.c.id
            )
        )
        .where(sa.and_(game.c.slug == "valorant", is_empty))
    ).fetchall()

    if not rows:
        return

    polygons = _fixture_polygons()

    for row in rows:
        points = polygons.get((row.map_slug, row.zone_slug))
        if not points:
            continue
        bind.execute(
            sa.update(map_zone)
            .where(map_zone.c.id == row.id)
            .values(polygon_points=points)
        )


def downgrade() -> None:
    # Intentionally a no-op — see 0008's module docstring.
    pass
