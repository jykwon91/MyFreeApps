# WoW Forever Raid Consumables Generator

Generates `backend/data/wow/raid_consumables.json` — the committed consumables
dataset consumed at runtime by `app/services/wow/raid_consumables.py`.

## Quick start

From `apps/mygamingassistant/backend/`:

```bash
source .venv/bin/activate
python -m scripts.wow_consumables.build
```

The first run downloads `ItemSparse.csv` from wago.tools (~2 MB per build).
Subsequent runs use the local cache under
`$TEMP/mga-wow-world-map-cache/<build>/ItemSparse.csv` (shared with the
World Map generator) and complete in under a second.

## Verification provenance

| Field | Value |
|---|---|
| Spec verified by | wow-forever-expert |
| Spec verified date | 2026-10-01 |
| WoW Forever client build | 1.60.1.69977 (`wow_classic_beta` branch) |
| Classic Era client build | 1.15.9.69722 (`wow_classic_era` branch) |
| Item source | wago.tools DB2 CSV export |

All item IDs must exist in the Forever beta client (`1.60.1.69977`).  The
build fails loudly if any ID is missing.

## Blocked items

Item `21546` ("Elixir of Holy Power" in the Forever client) is excluded until
a subject-matter expert confirms whether it applies in Forever raids.  See
`spec.py → BLOCKED_IDS`.

## Items excluded by design

`always` in the spec includes a non-addressable entry ("Repair to 100%") with
`item_id: None`.  This item has no Wowhead page and is excluded from the JSON.
It is documented here for completeness: every raider should repair to 100%
durability before a raid.

## Adding or changing consumables

1. Edit `spec.py` — the only hand-curated file.
2. Re-run the build: `python -m scripts.wow_consumables.build`
3. Verify `backend/data/wow/raid_consumables.json` changed as expected.
4. Run tests: `pytest tests/test_wow_raid_consumables.py -v`
5. Commit both `spec.py` and the regenerated JSON together.

## Structure

```
scripts/wow_consumables/
├── __init__.py
├── spec.py        Hand-curated spec (Python data translated from YAML)
├── build.py       Generator: resolves names, writes data JSON
└── README.md      This file
```

## advice_source

Raids are tagged with `advice_source: "forever" | "classic"`:

| Raid | advice_source | Notes |
|---|---|---|
| `barrow_deeps` | `forever` | Announced Dec 9 launch |
| `hyjal_summit` | `forever` | Announced Dec 9 launch |
| `onyxia` | `classic` | Announced-likely; mechanics match Classic |
| `mc`, `bwl`, `zg`, `aq20`, `aq40`, `naxx` | `classic` | Unannounced; Classic porting |

The Discord bot should prefix unverified raid advice with:
> "Classic advice — may differ in WoW Forever."

The `select_consumables()` service sets `classic_advice: bool` on the
returned checklist for this purpose.

## Attribution

Item display names: WoW Forever beta client (build 1.60.1.69977), accessed
via wago.tools DB2 export.  Game data © Blizzard Entertainment.
