"""Backfill CS2 map-zone polygons from the fixture for existing DBs

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-16 00:00:01.000000

Data migration for the dead-center-pin bug.

CS2 ``map_zone`` rows seeded before this series shipped have an empty
``polygon_points`` (``[]``). Without a polygon and without an explicit
anchor, ``LineupRead.effective_*`` resolves to ``None`` and the lineup has
no place on the map (the correctness fix in ``lineup_schemas`` stopped the
old ``(0.5, 0.5)`` dead-center sentinel from masking this).

``app/fixtures/cs2_maps.json`` now carries approximate seed polygons for all
62 CS2 zones, but ``load_fixtures`` is CLI-only — it does NOT run in the
app lifespan, so an already-deployed database would never receive the
polygons. This migration walks the fixture and writes its polygon onto
every CS2 zone whose stored ``polygon_points`` is empty.

Conservative + idempotent:
- Only zones joined to a ``game`` with ``slug = 'cs2'`` are touched.
- Only rows whose ``polygon_points`` is NULL or a zero-length JSON array
  are updated — a zone that already has a non-empty polygon (operator-drawn
  via the #656 editor, or already backfilled) is NEVER overwritten.
- Re-running selects nothing once polygons are populated.

Downgrade is intentionally a no-op: the pre-migration state was an empty
polygon, which is indistinguishable from a deliberately-cleared zone, and
restoring "empty" would re-break pin placement. Reverting the code is the
supported rollback path; a populated approximate polygon is valid input
for the old code too (it simply rendered the centroid), so leaving the
backfilled polygons in place is strictly safer than clearing them.
"""
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _load_cs2_fixture() -> list[dict]:
    """Resolve and parse ``app/fixtures/cs2_maps.json`` independent of CWD.

    This file lives at ``alembic/versions/0008_*.py``; ``parents[2]`` is the
    backend root, mirroring how ``fixture_loader`` resolves its fixtures dir.
    """
    fixture_path = (
        Path(__file__).resolve().parents[2]
        / "app"
        / "fixtures"
        / "cs2_maps.json"
    )
    with fixture_path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _fixture_polygons() -> dict[tuple[str, str], list]:
    """Flatten the fixture into ``{(map_slug, zone_slug): polygon_points}``.

    Only non-empty polygons are included — there is nothing to backfill from
    an empty fixture entry.
    """
    out: dict[tuple[str, str], list] = {}
    for entry in _load_cs2_fixture():
        if entry.get("game_slug") != "cs2":
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
        sa.column("polygon_points", sa.JSON),
    )

    # Empty == NULL OR a zero-length JSON array. polygon_points is a JSON
    # column (not JSONB), so use json_array_length under a type guard so the
    # length check never raises on a non-array value.
    is_empty = sa.or_(
        map_zone.c.polygon_points.is_(None),
        sa.text(
            "(json_typeof(map_zone.polygon_points) = 'array' "
            "AND json_array_length(map_zone.polygon_points) = 0)"
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
        .where(sa.and_(game.c.slug == "cs2", is_empty))
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
    # Intentionally a no-op — see module docstring.
    pass
