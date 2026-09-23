"""Pinned upstream sources for the World Map generator + a small download cache.

Two upstreams, kept apart because their licences differ:

* **cmangos classic-db** (GPL-3.0) — NPC spawns + templates. Everything
  derived from it is written to ``data/worldMap/classic/`` next to its own
  LICENSE, never mixed into MIT-licensed files.
* **Blizzard client tables** (``wow_classic_era`` DB2, exported as CSV by
  wago.tools) — map bounds, faction reactions, zone names, map art. Game data
  © Blizzard Entertainment.

Downloads are cached under the OS temp dir so re-runs are fast; delete the
cache dir (printed at start) to force a refresh.
"""
from __future__ import annotations

import csv
import io
import tempfile
import urllib.request
from pathlib import Path

CMANGOS_REPO = "cmangos/classic-db"
# Pinned commit. Bump deliberately and re-run the generator; the output JSON
# records the SHA so every committed data file is traceable.
CMANGOS_COMMIT = "ec4f596146be6467ea93c57397858e329e2db852"
CMANGOS_DUMP = "Full_DB/ClassicDB_1_12_1_z2815.sql.gz"
CMANGOS_DUMP_URL = (
    f"https://raw.githubusercontent.com/{CMANGOS_REPO}/{CMANGOS_COMMIT}/{CMANGOS_DUMP}"
)

WAGO_BRANCH = "wow_classic_beta"  # WoW Forever beta client builds (1.60.x)
WAGO_BUILD = "1.60.1.69977"

# The Forever client no longer ships instance-entrance area triggers (they
# are server-side now), so their positions come from the Classic Era client:
# the same 1.x world, where the entrances haven't moved.
WAGO_ERA_BRANCH = "wow_classic_era"
WAGO_ERA_BUILD = "1.15.9.69722"

_USER_AGENT = "MyGamingAssistant world-map generator (github.com/jykwon91/MyFreeApps)"

CACHE_DIR = Path(tempfile.gettempdir()) / "mga-wow-world-map-cache"


def _fetch(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = resp.read()
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return dest


def cmangos_dump() -> Path:
    return _fetch(CMANGOS_DUMP_URL, CACHE_DIR / f"classicdb-{CMANGOS_COMMIT[:12]}.sql.gz")


def wago_table(
    name: str, *, branch: str = WAGO_BRANCH, build: str = WAGO_BUILD
) -> list[dict[str, str]]:
    url = f"https://wago.tools/db2/{name}/csv?branch={branch}&build={build}"
    path = _fetch(url, CACHE_DIR / build / f"{name}.csv")
    return list(csv.DictReader(io.StringIO(path.read_text(encoding="utf-8"))))


def wago_file(file_data_id: int) -> bytes:
    url = (
        f"https://wago.tools/api/casc/{file_data_id}"
        f"?download&branch={WAGO_BRANCH}&build={WAGO_BUILD}"
    )
    return _fetch(url, CACHE_DIR / WAGO_BUILD / "files" / f"{file_data_id}.blp").read_bytes()
