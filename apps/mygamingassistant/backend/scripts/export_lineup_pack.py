"""Local runner: dump accepted lineups → apps/mygamingassistant/data/lineup_library.json.

Thin wrapper over ``app.services.game.lineup_exporter.build_pack`` (the
committed export logic — see that module for the why). Local authoring tool,
untracked like the rest of ``scripts/``; the JSON it writes IS committed
(public-safe, makes a fresh prod deploy reproducible).

Run from the backend dir with the app venv:
  .venv\\Scripts\\python.exe scripts\\export_lineup_pack.py
  .venv\\Scripts\\python.exe scripts\\export_lineup_pack.py --out <path>
Re-run whenever the accepted library changes, then commit the regenerated JSON.

``--out`` redirects the dump somewhere other than the committed pack. Use it whenever you want a
snapshot to diff/reconstruct from rather than to commit — the shared authoring DB carries
unshipped threads (pin-anchor batches, in-flight agents), so a default-path export OVERWRITES the
working-tree pack with all of that. Unknown flags are rejected rather than ignored: this script
previously accepted-and-ignored ``--out`` and silently clobbered the working-tree pack.
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.services.game.lineup_exporter import build_pack  # noqa: E402

_DEFAULT_OUT = ROOT / "data" / "lineup_library.json"


def _resolve_args() -> tuple[Path, bool]:
    """--out <path> | --out=<path> | --allow-regression; anything else is a hard error."""
    out, allow, rest = _DEFAULT_OUT, False, list(sys.argv[1:])
    while rest:
        arg = rest.pop(0)
        if arg.startswith("--out="):
            out = Path(arg.split("=", 1)[1])
        elif arg == "--out":
            if not rest:
                raise SystemExit("ABORT — --out needs a path")
            out = Path(rest.pop(0))
        elif arg == "--allow-regression":
            allow = True
        else:
            raise SystemExit(
                f"ABORT — unknown argument {arg!r}. Silently ignoring it would let this script "
                f"overwrite {_DEFAULT_OUT} when you meant to write elsewhere."
            )
    return out, allow


def _regressions(prev: dict, pack: dict) -> list[str]:
    """Everything the new pack would DROP relative to the pack already on disk.

    The pack is a complete snapshot and the importer treats it as authoritative — a lineup absent
    from it is retracted in prod, and a field that comes back null overwrites the live value. So an
    export from a local DB that is BEHIND the committed pack silently destroys shipped work, and
    the destruction is invisible in the run output because the per-map counts still look right.

    That is not hypothetical. This guard was added after an export from a DB holding pins for only
    two maps would have blanked `stand_anchor_x/y` on 288 already-shipped rows across haven,
    ascent, summit, sunset, split and lotus, purely because those pins had been placed by other
    sessions and had never made it back into this DB. Additions and non-null edits are ordinary
    authoring and are NOT reported; only losses are, because only losses are unrecoverable from
    the artifact being overwritten.

    The fix when this fires is almost always to re-import the committed pack first
    (`python -m app.cli import-lineups data/lineup_library.json`), re-accept whatever the current
    batch is, and export again — a round-trip that makes the DB agree with the artifact.
    """
    out: list[str] = []
    prev_l = {ln["id"]: ln for ln in prev.get("lineups", [])}
    new_l = {ln["id"]: ln for ln in pack.get("lineups", [])}

    gone = sorted(prev_l.keys() - new_l.keys())
    for lid in gone[:10]:
        p = prev_l[lid]
        out.append(f"lineup dropped: {lid[:8]} {p.get('map_slug')} :: {p.get('title')}")
    if len(gone) > 10:
        out.append(f"... and {len(gone) - 10} more dropped lineup(s)")

    blanked: dict[str, int] = {}
    for lid, p in prev_l.items():
        n = new_l.get(lid)
        if n is None:
            continue
        for k, v in p.items():
            if v is not None and n.get(k) is None:
                blanked[k] = blanked.get(k, 0) + 1
    for k, count in sorted(blanked.items()):
        out.append(f"field blanked on {count} surviving lineup(s): {k}")

    for key in ("zones", "sources"):
        a = {json.dumps(x, sort_keys=True) for x in prev.get(key, [])}
        b = {json.dumps(x, sort_keys=True) for x in pack.get(key, [])}
        if a - b:
            out.append(f"{len(a - b)} {key[:-1]}(s) present on disk are absent from this export")
    return out


async def main() -> None:
    out_path, allow_regression = _resolve_args()
    async with AsyncSessionLocal() as db:
        pack = await build_pack(db)

    if out_path.is_file() and not allow_regression:
        prev = json.loads(out_path.read_text(encoding="utf-8"))
        losses = _regressions(prev, pack)
        if losses:
            detail = "".join(f"\n  - {line}" for line in losses)
            raise SystemExit(
                f"ABORT — this export would REMOVE data that {out_path.name} already ships:"
                f"{detail}\n"
                f"Nothing was written. The pack is a complete snapshot, so the importer would "
                f"retract dropped lineups and null out blanked fields in prod. Re-import the "
                f"committed pack first (python -m app.cli import-lineups data/lineup_library.json), "
                f"re-accept the current batch, then export again. Pass --allow-regression only "
                f"when the removal is the point."
            )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(pack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"Wrote {out_path}")
    print(
        f"  lineups={pack['lineup_count']}  "
        f"zones={len(pack['zones'])}  sources={len(pack['sources'])}"
    )
    # Per-map breakdown so the operator can eyeball coverage at a glance.
    by_map: dict[str, int] = {}
    for ln in pack["lineups"]:
        by_map[ln["map_slug"]] = by_map.get(ln["map_slug"], 0) + 1
    for map_slug, n in sorted(by_map.items()):
        print(f"    {map_slug}: {n}")


asyncio.run(main())
