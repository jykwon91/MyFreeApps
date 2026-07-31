"""Data-driven Valorant lineup ingest driver — generic across ALL agents + maps.

Generalized from ingest_viper.py (Initiative 18) for the full-agent build (Phase B):
build every lineup-capable Valorant agent. One JSON per (agent, map) lives under
scripts/<agent>-spans/<map>.json, e.g. scripts/brimstone-spans/ascent.json.

Each spans JSON has:
  {video_id, map_slug, author, note, lineups: [
    {cs, title, ability, technique, target, stand, side,
     spans:{stand:[s,e], aim:[s,e], throw:[s,e], landing:[s,e]}}, ...]}
- cs = floor(STAND.start), unique per lineup within the video (synthetic clip-storage
  key when the source has no chapters; a real chapter start when it does).
- ability = a utility_type.slug. Valorant ability slugs are GLOBALLY UNIQUE across
  agents (sky-smoke, snake-bite, mosh-pit, ...), so the agent is implied by the slug;
  the utility_type table already carries agent_id. All 56 ability slugs are seeded on
  origin/main + prod, so every agent's abilities resolve with no fixture work.
- target/stand are COARSE map-zone slugs (the fine callout lives in `title`).
- side = side_a (attacker) | side_b (defender).
- spans.throw is OMITTED for PLACED utility (utility_type.placement == 'placed':
  Cypher's trapwire/spycam, Killjoy's alarmbot/turret, Chamber's trademark,
  Deadlock's sonic sensor). A mounted device never leaves the player's hands, so
  those lineups are a complete THREE-beat STAND/AIM/LANDING story rather than a
  four-beat one missing a beat. Validation enforces this in BOTH directions: a
  placed row carrying a throw span fails just as loudly as a thrown row missing
  one, because each means the ability was read wrong or a beat was invented.

Subcommands (MAIN checkout venv, cwd = backend, PG:5433 up):
  plan   — resolve + validate every lineup (zones/utility exist), print, write nothing
  create — create pending_review rows (idempotent by video_id+cs)
  recut  — loop recut_lineup_clips.py per row with its spans
  accept — set zones/side/utility on every row (accept_lineup)

  .venv/Scripts/python.exe scripts/ingest_agent.py <agent> <map> plan
  .venv/Scripts/python.exe scripts/ingest_agent.py <agent> <map> create
  .venv/Scripts/python.exe scripts/ingest_agent.py <agent> <map> recut
  .venv/Scripts/python.exe scripts/ingest_agent.py <agent> <map> accept

MULTI-SOURCE (`--pack <stem>`)
  Multi-source ingest is the standing doctrine — one video per agent+map is a coverage
  defect. But `video_id` is a PER-PACK field and is the join key every subcommand uses
  (`Lineup.youtube_video_id == vid`), so two videos CANNOT share one pack file: recut
  would pull every clip from the wrong mp4 and `cs` values can collide across videos.

  Instead give each source its own pack under the same <agent>-spans/ dir and run the
  driver once per source:

    scripts/phoenix-spans/summit.json     <- source 1 (default stem = map slug)
    scripts/phoenix-spans/summit-n.json   <- source 2

    ingest_agent.py phoenix summit create
    ingest_agent.py phoenix summit create --pack summit-n

  `--pack` overrides ONLY the filename stem; the map is always resolved from the pack's
  own `map_slug`, so the two packs still land on the same map. Cross-source duplicate
  lineups are NOT auto-merged here — dedup is a separate judgement (see below).

DEDUP CAVEAT
  Do NOT dedup across sources on (ability, side, stand, target) alone. Those zones are
  coarse: one real source legitimately holds several distinct b-main -> b-site lineups
  that differ only by plant spot ("Plant 1/2/3", "Green Box", "Boxes"). Collapsing on
  the zone key destroys real content. Fine-grained dedup needs the pin ANCHORS, which
  only exist after pin placement — so treat same-zone pairs as CANDIDATES for the
  operator's eyeball, not as automatic merges.

Backward-compat: ingest_viper.py still exists for the shipped Viper spans; new agents
use this driver. To ingest Viper via this driver, symlink/copy viper-spans -> the
scripts/viper-spans dir already used (agent slug "viper" resolves scripts/viper-spans/).
"""
from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402
from app.models.game.map import Map  # noqa: E402
from app.models.game.map_zone import MapZone  # noqa: E402
from app.models.game.source import Source  # noqa: E402
from app.models.game.utility_type import UtilityType  # noqa: E402
from app.repositories.game.lineup.lifecycle import accept_lineup  # noqa: E402

GAME_SLUG = "valorant"


def _spans_dir(agent: str) -> Path:
    return ROOT / "scripts" / f"{agent}-spans"


def _load(agent: str, pack: str) -> dict:
    """Load one spans pack. `pack` is only a FILE STEM — the real map is always read from
    the pack's own `map_slug` field, so a non-default pack name never changes resolution."""
    path = _spans_dir(agent) / f"{pack}.json"
    if not path.exists():
        raise SystemExit(f"ABORT — {path} not found")
    return json.loads(path.read_text())


async def _resolve(db, data: dict):
    game_id = (await db.execute(text("SELECT id FROM game WHERE slug=:s"),
                                {"s": GAME_SLUG})).scalar_one()
    vmap = (await db.execute(select(Map).where(
        Map.slug == data["map_slug"], Map.game_id == game_id))).scalar_one()
    zones = {z.slug: z.id for z in (await db.execute(
        select(MapZone).where(MapZone.map_id == vmap.id))).scalars().all()}
    # Whole objects, not just ids — the pipeline needs `placement` to decide
    # whether a THROW beat is expected at all (placed utility has none).
    utils = {u.slug: u for u in (await db.execute(
        select(UtilityType).where(UtilityType.game_id == game_id))).scalars().all()}
    return game_id, vmap, zones, utils


def _validate(data: dict, zones: dict, utils: dict) -> None:
    errs = []
    seen = set()
    for ln in data["lineups"]:
        if ln["cs"] in seen:
            errs.append(f"duplicate cs={ln['cs']}")
        seen.add(ln["cs"])
        if ln["ability"] not in utils:
            errs.append(f"cs={ln['cs']} ability {ln['ability']!r} not a valorant "
                        f"utility_type slug (have: {', '.join(sorted(utils))})")
        for zk in ("target", "stand"):
            if ln[zk] not in zones:
                errs.append(f"cs={ln['cs']} {zk} zone {ln[zk]!r} not in map zones {sorted(zones)}")
        if ln["side"] not in ("side_a", "side_b"):
            errs.append(f"cs={ln['cs']} bad side {ln['side']!r}")

        # Placed utility (trapwire, spycam, alarmbot, turret, trademark, sonic
        # sensor) is mounted, not lobbed, so its story is a complete 3-beat
        # STAND/AIM/LANDING. Demanding a throw span there would fail every one
        # of those rows; accepting one silently would mean the localizer
        # invented a beat that does not exist on screen, or read the ability
        # wrong. Both are worth failing loudly on, in opposite directions.
        placed = ln["ability"] in utils and utils[ln["ability"]].placement == "placed"
        events = ("stand", "aim", "landing") if placed else ("stand", "aim", "throw", "landing")
        if placed and "throw" in ln["spans"]:
            errs.append(
                f"cs={ln['cs']} ability {ln['ability']!r} is placed utility but a "
                f"'throw' span was supplied — placed utility never leaves the hands. "
                f"Either the ability is misread or the throw beat is invented."
            )
        for ev in events:
            if ev not in ln["spans"]:
                errs.append(f"cs={ln['cs']} missing {ev!r} span")
                continue
            s, e = ln["spans"][ev]
            if not (e > s):
                errs.append(f"cs={ln['cs']} {ev}: end {e} must be > start {s}")
    if errs:
        raise SystemExit("VALIDATION FAILED:\n  " + "\n  ".join(errs))


async def cmd_plan(agent: str, pack: str) -> None:
    data = _load(agent, pack)
    async with AsyncSessionLocal() as db:
        _, vmap, zones, utils = await _resolve(db, data)
        _validate(data, zones, utils)
        print(f"{agent} / {data['map_slug']} — {len(data['lineups'])} lineups, video {data['video_id']}")
        for ln in data["lineups"]:
            sp = ln["spans"]
            beat = f"thr={sp['throw'][0]:.2f}" if "throw" in sp else "PLACED    "
            print(f"  cs={ln['cs']:4} {ln['ability']:14} {ln['stand']:7}->{ln['target']:7} "
                  f"{ln['side']} {beat} :: {ln['title']}")
        print("validation OK (all utilities + zones resolve).")


async def cmd_create(agent: str, pack: str) -> None:
    data = _load(agent, pack)
    vid = data["video_id"]
    url = f"https://www.youtube.com/watch?v={vid}"
    async with AsyncSessionLocal() as db:
        game_id, vmap, zones, utils = await _resolve(db, data)
        _validate(data, zones, utils)
        src_id = (await db.execute(
            text("SELECT id FROM source WHERE config_json->>'url' = :u"), {"u": url})).scalar_one_or_none()
        if src_id is None:
            src = Source(kind="youtube_playlist", config_json={
                "url": url, "map_hint": data["map_slug"], "game_hint": GAME_SLUG, "agent_hint": agent})
            db.add(src); await db.flush(); src_id = src.id
        existing = {cs for (cs,) in (await db.execute(
            select(Lineup.chapter_start_seconds).where(Lineup.youtube_video_id == vid))).all() if cs is not None}
        made = 0
        for ln in data["lineups"]:
            if ln["cs"] in existing:
                print(f"  SKIP cs={ln['cs']} (exists)"); continue
            row = Lineup(
                game_id=game_id, map_id=vmap.id, utility_type_id=utils[ln["ability"]].id,
                title=ln["title"], chapter_title=ln["title"], chapter_start_seconds=ln["cs"],
                youtube_video_id=vid, attribution_url=url, attribution_author=data["author"],
                source_id=src_id, technique=ln["technique"],
                target_zone_id=None, stand_zone_id=None, side=None, status="pending_review",
            )
            db.add(row); await db.flush()
            print(f"  CREATE cs={ln['cs']:4} id8={str(row.id)[:8]} {ln['title']}")
            made += 1
        await db.commit()
        print(f"DONE — created {made}, {len(data['lineups'])-made} pre-existing.")


def cmd_recut(agent: str, pack: str) -> None:
    data = _load(agent, pack)
    vid = data["video_id"]
    py = str(ROOT / ".venv" / "Scripts" / "python.exe")
    recut = str(ROOT / "scripts" / "recut_lineup_clips.py")

    async def _ids():
        async with AsyncSessionLocal() as db:
            # Validate here too, not just in plan/create/accept. recut is the one
            # subcommand that writes MEDIA, and a missing 'throw' span is
            # ambiguous on its face: legitimate for placed utility, a truncated
            # pack for anything else. Only the utility's `placement` separates
            # them, and that needs the DB — so resolve before cutting anything.
            _, _, zones, utils = await _resolve(db, data)
            _validate(data, zones, utils)
            rows = (await db.execute(select(Lineup).where(Lineup.youtube_video_id == vid))).scalars().all()
            return {r.chapter_start_seconds: str(r.id)[:8] for r in rows}
    id_by_cs = asyncio.run(_ids())

    ok = fail = 0
    for ln in data["lineups"]:
        id8 = id_by_cs.get(ln["cs"])
        if not id8:
            print(f"  NO ROW cs={ln['cs']} — run create first"); fail += 1; continue
        sp = ln["spans"]
        cmd = [py, recut, id8,
               "--stand", str(sp["stand"][0]), str(sp["stand"][1]),
               "--aim", str(sp["aim"][0]), str(sp["aim"][1]),
               "--landing", str(sp["landing"][0]), str(sp["landing"][1])]
        # Absent for placed utility — recut then skips the tight throw cut and
        # leaves clip_url NULL. _validate ran above, so a missing throw span
        # here is established as placed, not as a truncated pack.
        if "throw" in sp:
            cmd += ["--throw", str(sp["throw"][0]), str(sp["throw"][1])]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  RECUT cs={ln['cs']:4} id8={id8} OK"); ok += 1
        else:
            tail = (r.stdout + r.stderr).strip().splitlines()[-1:] or [""]
            print(f"  !! FAIL cs={ln['cs']} id8={id8}: {tail[0]}"); fail += 1
    print(f"RECUT done; {ok} ok, {fail} failed.")


async def cmd_accept(agent: str, pack: str) -> None:
    data = _load(agent, pack)
    vid = data["video_id"]
    async with AsyncSessionLocal() as db:
        game_id, vmap, zones, utils = await _resolve(db, data)
        _validate(data, zones, utils)
        rows = {r.chapter_start_seconds: r for r in (await db.execute(
            select(Lineup).where(Lineup.youtube_video_id == vid))).scalars().all()}
        ok = 0
        for ln in data["lineups"]:
            row = rows.get(ln["cs"])
            if row is None:
                print(f"  NO ROW cs={ln['cs']}"); continue
            await accept_lineup(db, row, {
                "game_id": game_id, "map_id": vmap.id,
                "utility_type_id": utils[ln["ability"]].id,
                "target_zone_id": zones[ln["target"]], "stand_zone_id": zones[ln["stand"]],
                "side": ln["side"],
            })
            print(f"  ACCEPT cs={ln['cs']:4} {ln['ability']:14} {ln['stand']}->{ln['target']} {ln['side']} :: {ln['title']}")
            ok += 1
        await db.commit()
        print(f"ACCEPTED {ok}/{len(data['lineups'])}")


def main() -> None:
    # A second (third, ...) SOURCE for the same agent+map lives in its own pack file, because
    # video_id is per-pack and is the join key for create/recut/accept. Merging two videos into
    # one pack would recut every clip from the wrong mp4. Default stem is the map slug, so all
    # existing single-source invocations are unchanged.
    pack_override, positional, rest = None, [], list(sys.argv[1:])
    while rest:
        a = rest.pop(0)
        if a.startswith("--pack="):
            pack_override = a.split("=", 1)[1]
        elif a == "--pack":
            if not rest:
                raise SystemExit("ABORT — --pack needs a value")
            pack_override = rest.pop(0)
        elif a.startswith("--"):
            raise SystemExit(f"unknown flag {a!r}")
        else:
            positional.append(a)

    if len(positional) < 3:
        raise SystemExit(
            "usage: ingest_agent.py <agent> <map> {plan|create|recut|accept} [--pack <stem>]")
    agent, map_slug, sub = positional[0], positional[1], positional[2]
    pack = pack_override or map_slug
    if pack != map_slug:
        print(f"[pack] using scripts/{agent}-spans/{pack}.json")

    if sub == "recut":
        cmd_recut(agent, pack)
    elif sub in ("plan", "create", "accept"):
        asyncio.run({"plan": cmd_plan, "create": cmd_create, "accept": cmd_accept}[sub](agent, pack))
    else:
        raise SystemExit(f"unknown subcommand {sub!r}")


if __name__ == "__main__":
    main()
