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

WAGO_BRANCH = "wowf"  # WoW Forever's own client product (1.60.x). `python -m scripts.wow_refresh` moves the build.
WAGO_BUILD = "1.60.1.70888"

# The Forever client ships only some instance-entrance area triggers. The rest
# come from the Classic Era client: see `area_triggers`.
WAGO_ERA_BRANCH = "wow_classic_era"
WAGO_ERA_BUILD = "1.15.9.70576"

# Record layouts of the client tables, for decoding the game's own hotfix cache.
WOWDBDEFS_REPO = "wowdev/WoWDBDefs"

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
    name: str, *, branch: str = WAGO_BRANCH, build: str = WAGO_BUILD, hotfixes: bool = False
) -> list[dict[str, str]]:
    """A client table as wago.tools exports it.

    ``hotfixes`` asks for the table with the server hotfixes wago.tools has
    collected applied on top of the client file. Forever ships most of its
    items only that way (see ``scripts/wow_items/forever_items.py``). The
    hotfix set grows over time, so that export isn't fixed for a build the way
    the plain one is; it is cached per build all the same.
    """
    url = f"https://wago.tools/db2/{name}/csv?branch={branch}&build={build}"
    stem = name
    if hotfixes:
        url += "&useHotfixes=1"
        stem += ".hotfixes"
    path = _fetch(url, CACHE_DIR / build / f"{stem}.csv")
    return list(csv.DictReader(io.StringIO(path.read_text(encoding="utf-8"))))


def wowdbdefs_definition(table: str, client_build: int) -> str:
    """WoWDBDefs' column layout file for a client table (MIT, github.com/wowdev/WoWDBDefs).

    Read from ``master``: a definition only ever gains layouts for new builds,
    and it is cached per client build number, so a new client build fetches a
    copy that knows it.
    """
    url = f"https://raw.githubusercontent.com/{WOWDBDEFS_REPO}/master/definitions/{table}.dbd"
    return _fetch(url, CACHE_DIR / "wowdbdefs" / str(client_build) / f"{table}.dbd").read_text(encoding="utf-8")


def area_triggers() -> list[dict[str, str]]:
    """Forever's area triggers, with Classic Era's only for the ones it doesn't ship.

    Forever's rows win, so an entrance moved in a new build moves here too.
    """
    rows = {r["ID"]: r for r in wago_table("AreaTrigger", branch=WAGO_ERA_BRANCH, build=WAGO_ERA_BUILD)}
    rows.update({r["ID"]: r for r in wago_table("AreaTrigger")})
    return list(rows.values())


def wago_file(file_data_id: int) -> bytes:
    url = (
        f"https://wago.tools/api/casc/{file_data_id}"
        f"?download&branch={WAGO_BRANCH}&build={WAGO_BUILD}"
    )
    return _fetch(url, CACHE_DIR / WAGO_BUILD / "files" / f"{file_data_id}.blp").read_bytes()
