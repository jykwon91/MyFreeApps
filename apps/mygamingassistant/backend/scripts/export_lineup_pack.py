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


def _resolve_out() -> Path:
    """--out <path> | --out=<path>; anything else unrecognised is a hard error."""
    out, rest = _DEFAULT_OUT, list(sys.argv[1:])
    while rest:
        arg = rest.pop(0)
        if arg.startswith("--out="):
            out = Path(arg.split("=", 1)[1])
        elif arg == "--out":
            if not rest:
                raise SystemExit("ABORT — --out needs a path")
            out = Path(rest.pop(0))
        else:
            raise SystemExit(
                f"ABORT — unknown argument {arg!r}. Silently ignoring it would let this script "
                f"overwrite {_DEFAULT_OUT} when you meant to write elsewhere."
            )
    return out


async def main() -> None:
    out_path = _resolve_out()
    async with AsyncSessionLocal() as db:
        pack = await build_pack(db)

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
