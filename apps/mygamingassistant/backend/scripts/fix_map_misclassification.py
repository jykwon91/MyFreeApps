"""Operator data fix (LOCAL dev DB): 4 lineups from the Mirage source video
(Q4Dwg9Z0wZ0) were mis-classified onto dust2/ancient by the classifier, which
confused the callout NAMES (Catwalk is famous on dust2; Jungle/Ticket on
ancient) even though those zones also exist on Mirage and the footage is Mirage.

Verified all-Mirage 2026-05-29 by frame inspection: radar shows "Palace Alley"
(a Mirage A-site callout), Moroccan architecture, palm trees, smoke loadout —
NOT ancient's green-stone Mayan look. The chapter titles (== chapter_title) are
correct Mirage callouts, so the fix is a title-faithful repoint of map_id +
the two zone FKs onto the matching Mirage zone rows. Anchors are already NULL,
so minimap placement falls back to the new Mirage zone centroids automatically.

CANNOT null the zone FKs: ck_lineup_accepted_classified forbids NULL
target_zone_id / stand_zone_id on accepted rows (that's why the prior null
attempt hit IntegrityError). We repoint instead.

suggested_* columns are intentionally LEFT AS-IS — they record the classifier's
original wrong guess (audit trail for the scoping-fix PR). They don't affect
display (public read builds from the accepted FK columns).

Reversible: re-run the zone classifier scoped to Mirage, or re-place in the UI.
Prints before/after; commits once; aborts (no commit) if any zone slug fails to
resolve on Mirage.
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402

# id8 prefix -> title-faithful Mirage (stand_zone slug, target_zone slug).
# stand="from X" / "X - <Site>"; target = the site/spot the smoke lands on.
REMAP = {
    "5a1ff0a1": {"stand": "t-spawn", "target": "catwalk"},  # Catwalk from T Spawn
    "8f92c010": {"stand": "catwalk", "target": "b-site"},   # Catwalk - B Site
    "89c4bfd9": {"stand": "ticket-booth", "target": "a-site"},  # Ticket/CT - A Site
    "f88308e3": {"stand": "jungle", "target": "a-site"},    # Jungle - A Site
}


async def _dump(db, label):
    print(f"\n=== {label} ===")
    rows = (await db.execute(text(
        "SELECT l.id, l.title, m.slug AS map_slug, "
        "tz.slug AS tz, sz.slug AS sz "
        "FROM lineup l "
        "LEFT JOIN map m ON m.id=l.map_id "
        "LEFT JOIN map_zone tz ON tz.id=l.target_zone_id "
        "LEFT JOIN map_zone sz ON sz.id=l.stand_zone_id "
        "WHERE " + " OR ".join(f"l.id::text LIKE '{p}%'" for p in REMAP)
        + " ORDER BY l.chapter_start_seconds"
    ))).mappings().all()
    for r in rows:
        print(f"  {str(r['id'])[:8]} map={r['map_slug']:8} "
              f"stand_zone={r['sz']:14} target_zone={r['tz']:10}  {r['title']!r}")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        game_id = (await db.execute(text(
            "SELECT id FROM game WHERE slug='cs2'"))).scalar()
        mirage_id = (await db.execute(text(
            "SELECT id FROM map WHERE slug='mirage' AND game_id=:g"),
            {"g": game_id})).scalar()
        if mirage_id is None:
            print("ERROR: could not resolve cs2/mirage map id"); sys.exit(1)

        zrows = (await db.execute(text(
            "SELECT slug, id FROM map_zone WHERE map_id=:m"), {"m": mirage_id})).all()
        zone_id = {slug: zid for slug, zid in zrows}
        print(f"cs2 game_id={game_id}  mirage map_id={mirage_id}  "
              f"mirage zones: {sorted(zone_id)}")

        # Validate every target slug resolves on Mirage BEFORE mutating.
        missing = {
            pfx: [s for s in (m['stand'], m['target']) if s not in zone_id]
            for pfx, m in REMAP.items()
        }
        missing = {k: v for k, v in missing.items() if v}
        if missing:
            print(f"ABORT — unresolved Mirage zone slugs: {missing}"); sys.exit(1)

        await _dump(db, "BEFORE")

        n = 0
        for pfx, m in REMAP.items():
            res = await db.execute(text(
                "UPDATE lineup SET map_id=:mid, "
                "stand_zone_id=:sz, target_zone_id=:tz "
                f"WHERE id::text LIKE '{pfx}%'"
            ), {"mid": mirage_id, "sz": zone_id[m['stand']], "tz": zone_id[m['target']]})
            n += res.rowcount
        await db.commit()
        print(f"\nUPDATED {n} rows -> map_id=mirage + title-faithful Mirage zones.")

        await _dump(db, "AFTER")


asyncio.run(main())
