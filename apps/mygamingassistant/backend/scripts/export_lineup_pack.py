"""Local runner: dump accepted lineups → apps/mygamingassistant/data/lineup_library.json.

Thin wrapper over ``app.services.game.lineup_exporter.build_pack`` (the
committed export logic — see that module for the why). Local authoring tool,
untracked like the rest of ``scripts/``; the JSON it writes IS committed
(public-safe, makes a fresh prod deploy reproducible).

Run from the backend dir with the app venv:
  .venv\\Scripts\\python.exe scripts\\export_lineup_pack.py
Re-run whenever the accepted library changes, then commit the regenerated JSON.
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.services.game.lineup_exporter import build_pack  # noqa: E402

_OUT_PATH = ROOT / "data" / "lineup_library.json"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        pack = await build_pack(db)

    _OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    _OUT_PATH.write_text(
        json.dumps(pack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"Wrote {_OUT_PATH}")
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
