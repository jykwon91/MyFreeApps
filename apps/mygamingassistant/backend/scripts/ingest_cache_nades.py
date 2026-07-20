"""Data-driven ingest for the Cache NADES guide (5gbIC3igve8, NartOutHere
"CS2 Cache Nades You NEED to Know in 2026", 484s). Companion to the smokes-guide
pipeline (create_cache_lineups.py + recut_lineup_clips.py + accept_cache_lineups.py).

Single source of truth = the per-chapter localization files the subagents wrote
to scripts/nades-spans/<cs4>.md (format defined in scripts/nades-spans/_ADDENDUM.md).
Each file holds one or more THROW blocks:

  # NEW | [<cs>,<ce>] | <utility> | <name> | throw_idx=<n>/<total>
  #   STAND s e | AIM s e | THROW s e | LANDING s e | <tech> | <TARGET> | <STAND> | <SIDE> | <conf>
  #   note: ...

Because chapter_start_seconds is an INTEGER column AND the MinIO clip key is
`pending/{video}/{cs}-{slot}`, sibling throws within one native chapter must get
DISTINCT integer cs values. We key each lineup by floor(STAND.start) (throws are
sequential, so these are unique within a chapter); collisions are bumped +1. The
native chapter's true end is preserved separately and passed to recut as
--chapter-end so the wide source is bounded correctly regardless of cs.

Subcommands (run via MAIN checkout venv, cwd = backend):
  .venv/Scripts/python.exe scripts/ingest_cache_nades.py plan     # parse + validate, no writes
  .venv/Scripts/python.exe scripts/ingest_cache_nades.py create   # create pending rows + write _manifest.json
  .venv/Scripts/python.exe scripts/ingest_cache_nades.py recut     # loop recut_lineup_clips.py per row
  .venv/Scripts/python.exe scripts/ingest_cache_nades.py accept    # set zones/side (util set at create)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
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

YOUTUBE_VIDEO_ID = "5gbIC3igve8"
VIDEO_URL = f"https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}"
AUTHOR = "NartOutHere"
GAME_SLUG = "cs2"
MAP_SLUG = "cache"

SPANS_DIR = ROOT / "scripts" / "nades-spans"
MANIFEST = SPANS_DIR / "_manifest.json"

# Native chapter titles (from yt-dlp) keyed by native chapter start second — used
# for chapter_title (provenance). The block header's [cs,ce] is the native range.
NATIVE_CHAPTERS: dict[int, str] = {
    0: "T Mid Nades", 11: "Connector smoke", 18: "Mid utility combo from Boost",
    38: "Mid lurk smoke", 52: "Instant Boost smoke", 61: "Boost smoke",
    75: "Mid control nades", 88: "Under Boost molotov", 94: "White Box molotov",
    101: "Whitebox molotov", 108: "Sandbag molotov", 119: "Vent molotov",
    131: "Mid flashes", 175: "A cross smoke", 192: "Fast A cross smoke for rush",
    199: "Fast A Site smoke for rush", 211: "A Execute Nades", 238: "Forklift Molotov",
    245: "NBK and Quad Molotov", 254: "B Main lurk smoke",
    288: "Tree smoke and headshot molotov", 297: "Tree smoke & HS molotov",
    312: "B Tree smoke and B site molotov", 325: "B single molotov",
    332: "Heaven molotov", 345: "Solo B Execute Nades Combo", 374: "Garage smoke",
    381: "Antirush Mid nades", 396: "Boost Grenade", 402: "A Main smoke",
    408: "Deep A Main smoke", 418: "A Main flash", 427: "A Main box molotov",
    432: "A Main control utility", 441: "Defensive A Site smoke", 452: "B Main smoke",
    459: "B Main flash", 471: "Defensive B Smoke",
}

_NC_SORTED = sorted(NATIVE_CHAPTERS.items())


def native_title(sec: float) -> str:
    """Native chapter TITLE containing second `sec` (some localizers headered a
    per-throw sub-window instead of the native chapter range, so exact-match on
    cs is unreliable — locate the containing chapter instead)."""
    title = "?"
    for start, t in _NC_SORTED:
        if start <= sec:
            title = t
        else:
            break
    return title


_HEADER = re.compile(
    r"^#\s*NEW\s*\|\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]\s*\|\s*([A-Za-z_]+)\s*\|\s*"
    r"(.+?)\s*(?:\|\s*throw_idx=\s*(\d+)\s*/\s*(\d+)\s*)?$"
)
# 4 span pairs anchored; the trailing (technique|target|stand|[side]|conf) tail is
# split separately because some localizers drop the SIDE field (putting side in the
# note instead) or reorder — a rigid regex would reject those.
_SPANS = re.compile(
    r"^#\s*STAND\s+([\d.]+)\s+([\d.]+)\s*\|\s*AIM\s+([\d.]+)\s+([\d.]+)\s*\|\s*"
    r"THROW\s+([\d.]+)\s+([\d.]+)\s*\|\s*LANDING\s+([\d.]+)\s+([\d.]+)\s*\|\s*(.+)$"
)
_SIDE = re.compile(r"side_[ab]")
_CONF = re.compile(r"^(high|med|medium|low)$", re.I)

# Map localizer utility words to our CS2 utility_type slugs. "incendiary" is the
# CT-side fire grenade — same fire utility as molotov in our taxonomy (we only
# have one fire slug). Others are common synonyms.
UTIL_ALIAS = {
    "incendiary": "molotov", "inc": "molotov", "molly": "molotov",
    "flashbang": "flash", "he": "grenade", "hegrenade": "grenade", "frag": "grenade",
}


def _parse_blocks() -> list[dict]:
    """Parse every nades-spans/<cs4>.md into throw dicts. Header line immediately
    followed (within a few lines) by a spans line."""
    blocks: list[dict] = []
    for fp in sorted(SPANS_DIR.glob("*.md")):
        if fp.name.startswith("_"):
            continue
        lines = fp.read_text(encoding="utf-8").splitlines()
        i = 0
        while i < len(lines):
            hm = _HEADER.match(lines[i].strip())
            if not hm:
                i += 1
                continue
            # find the spans line within the next few lines
            sm, note = None, ""
            for j in range(i + 1, min(i + 4, len(lines))):
                sm = _SPANS.match(lines[j].strip())
                if sm:
                    # grab the whole note (until the next NEW header) for a side fallback
                    note_lines = []
                    kk = j + 1
                    while kk < len(lines) and not _HEADER.match(lines[kk].strip()):
                        note_lines.append(lines[kk].strip())
                        kk += 1
                    note = " ".join(note_lines)
                    break
            if not sm:
                raise SystemExit(f"{fp.name}: header at line {i+1} has no spans line following")
            tail = [t.strip() for t in sm.group(9).split("|") if t.strip()]
            # tail = technique, target, stand, [side], [conf] — order is stable but
            # SIDE and CONF are each sometimes dropped. Pull them out positionally
            # for the first three, then classify the remainder.
            technique = tail[0].lower() if tail else "standing"
            target = tail[1] if len(tail) > 1 else "?"
            stand_zone = tail[2] if len(tail) > 2 else "?"
            rest = tail[3:]
            side = next((r for r in rest if _SIDE.fullmatch(r)), None)
            conf = next((r.lower() for r in rest if _CONF.match(r)), None)
            if side is None:  # fallback: some agents put the side only in the note
                mnote = _SIDE.search(note)
                side = mnote.group(0) if mnote else None
            cs_native, ce_native, util, name = int(hm.group(1)), int(hm.group(2)), hm.group(3), hm.group(4).strip()
            blocks.append({
                "file": fp.name,
                "cs_native": cs_native, "ce_native": ce_native,
                "utility": UTIL_ALIAS.get(util.lower(), util.lower()), "name": name,
                "throw_idx": int(hm.group(5)) if hm.group(5) else 1,
                "throw_total": int(hm.group(6)) if hm.group(6) else 1,
                "stand": [float(sm.group(1)), float(sm.group(2))],
                "aim": [float(sm.group(3)), float(sm.group(4))],
                "throw": [float(sm.group(5)), float(sm.group(6))],
                "landing": [float(sm.group(7)), float(sm.group(8))],
                "technique": technique,
                "target": target, "stand_zone": stand_zone,
                "side": side, "conf": conf or "med",
            })
            i = i + 1
    # sibling side inheritance: a throw that dropped its side inherits from another
    # throw in the SAME native chapter (combos share a side ~always).
    by_chapter: dict[int, str] = {}
    for b in blocks:
        if b["side"] in ("side_a", "side_b"):
            by_chapter.setdefault(b["cs_native"], b["side"])
    for b in blocks:
        if b["side"] not in ("side_a", "side_b") and b["cs_native"] in by_chapter:
            b["side"] = by_chapter[b["cs_native"]]
            b["side_inherited"] = True
    return blocks


def _assign_cs(blocks: list[dict]) -> None:
    """cs = floor(stand.start), bumped +1 on collision. Deterministic: sort by
    (native chapter, throw_idx) first so re-runs assign identically."""
    blocks.sort(key=lambda b: (b["cs_native"], b["throw_idx"]))
    used: set[int] = set()
    for b in blocks:
        cs = int(b["stand"][0])
        while cs in used:
            cs += 1
        used.add(cs)
        b["cs"] = cs


async def _resolve(db):
    game_id = (await db.execute(text("SELECT id FROM game WHERE slug=:s"), {"s": GAME_SLUG})).scalar_one_or_none()
    if game_id is None:
        raise SystemExit(f"game {GAME_SLUG!r} not found")
    cache = (await db.execute(select(Map).where(Map.slug == MAP_SLUG, Map.game_id == game_id))).scalar_one_or_none()
    if cache is None:
        raise SystemExit(f"map {MAP_SLUG!r} not found")
    zones = {z.slug: z.id for z in (await db.execute(
        select(MapZone).where(MapZone.map_id == cache.id))).scalars().all()}
    utils = {u.slug: u.id for u in (await db.execute(
        select(UtilityType).where(UtilityType.game_id == game_id))).scalars().all()}
    return game_id, cache.id, zones, utils


async def _ensure_source(db, *, dry_run: bool):
    existing = (await db.execute(
        text("SELECT id FROM source WHERE config_json->>'url' = :u"), {"u": VIDEO_URL})).scalar_one_or_none()
    if existing is not None or dry_run:
        return existing
    source = Source(kind="youtube_playlist",
                    config_json={"url": VIDEO_URL, "map_hint": MAP_SLUG, "game_hint": GAME_SLUG})
    db.add(source)
    await db.flush()
    return source.id


def _validate(blocks, zones, utils) -> list[str]:
    errs = []
    for b in blocks:
        if b["utility"] not in utils:
            errs.append(f"{b['file']} {b['name']!r}: utility {b['utility']!r} not in {sorted(utils)}")
        for slug in (b["target"], b["stand_zone"]):
            if slug not in zones:
                errs.append(f"{b['file']} {b['name']!r}: zone {slug!r} not in {sorted(zones)}")
        if b["side"] not in ("side_a", "side_b"):
            errs.append(f"{b['file']} {b['name']!r}: side unresolved ({b['side']!r})")
    return errs


async def cmd_plan(db):
    blocks = _parse_blocks()
    _assign_cs(blocks)
    _, _, zones, utils = await _resolve(db)
    errs = _validate(blocks, zones, utils)
    print(f"{'cs':>4} {'ce':>4} {'util':8} {'name':34} {'tgt':9} {'stand':9} {'side':6} {'conf':4} chapter")
    print("-" * 110)
    for b in blocks:
        print(f"{b['cs']:>4} {b['ce_native']:>4} {b['utility']:8} {b['name'][:34]:34} "
              f"{b['target']:9} {b['stand_zone']:9} {str(b['side']):6} {str(b['conf']):4} "
              f"{native_title(b['cs'])}")
    print("-" * 110)
    print(f"{len(blocks)} throws parsed from {len(set(b['file'] for b in blocks))} files.")
    if errs:
        print(f"\n!! {len(errs)} validation errors:")
        for e in errs:
            print(f"  {e}")
    else:
        print("validation OK (all utilities + zones resolve).")


async def cmd_create(db):
    blocks = _parse_blocks()
    _assign_cs(blocks)
    game_id, map_id, zones, utils = await _resolve(db)
    errs = _validate(blocks, zones, utils)
    if errs:
        raise SystemExit("validation failed; run `plan` and fix the span files:\n  " + "\n  ".join(errs))
    source_id = await _ensure_source(db, dry_run=False)
    existing = {cs for (cs,) in (await db.execute(
        select(Lineup.chapter_start_seconds).where(Lineup.youtube_video_id == YOUTUBE_VIDEO_ID))).all()
        if cs is not None}
    manifest = []
    created = 0
    for b in blocks:
        cs = b["cs"]
        if cs in existing:
            lid = (await db.execute(text(
                "SELECT id FROM lineup WHERE youtube_video_id=:v AND chapter_start_seconds=:c"),
                {"v": YOUTUBE_VIDEO_ID, "c": cs})).scalar_one()
            print(f"  SKIP cs={cs:<4} {b['name']!r} (exists id8={str(lid)[:8]})")
        else:
            lineup = Lineup(
                game_id=game_id, map_id=map_id, utility_type_id=utils[b["utility"]],
                title=b["name"], chapter_title=native_title(b["cs"]),
                chapter_start_seconds=cs, youtube_video_id=YOUTUBE_VIDEO_ID,
                attribution_url=VIDEO_URL, attribution_author=AUTHOR, source_id=source_id,
                technique=b["technique"], target_zone_id=None, stand_zone_id=None,
                side=None, status="pending_review",
            )
            db.add(lineup)
            await db.flush()
            lid = lineup.id
            created += 1
            print(f"  CREATE cs={cs:<4} util={b['utility']:8} id8={str(lid)[:8]} {b['name']!r}")
        manifest.append({**b, "id": str(lid), "id8": str(lid)[:8]})
    await db.commit()
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nDONE — created {created}, {len(blocks)-created} pre-existing. manifest -> {MANIFEST}")


async def cmd_accept(db):
    if not MANIFEST.exists():
        raise SystemExit("no _manifest.json; run `create` first")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    _, map_id, zones, utils = await _resolve(db)
    ok, errs = 0, []
    for m in manifest:
        lineup = (await db.execute(select(Lineup).where(Lineup.id == m["id"]))).scalar_one_or_none()
        if lineup is None:
            errs.append(f"{m['id8']}: row missing")
            continue
        overrides = {
            "game_id": lineup.game_id, "map_id": lineup.map_id,
            "utility_type_id": utils[m["utility"]],
            "target_zone_id": zones[m["target"]], "stand_zone_id": zones[m["stand_zone"]],
            "side": m["side"],
        }
        await accept_lineup(db, lineup, overrides)
        ok += 1
        print(f"  ACCEPT id8={m['id8']} {m['utility']:8} {m['stand_zone']:9}->{m['target']:9} {m['side']} {m['name'][:30]!r}")
    print(f"\n{'ACCEPTED'} {ok}/{len(manifest)}; errors={len(errs)}")
    for e in errs:
        print(f"  ERR {e}")


def cmd_recut() -> None:
    """Loop recut_lineup_clips.py per manifest row (subprocess; reuses tested cut path)."""
    if not MANIFEST.exists():
        raise SystemExit("no _manifest.json; run `create` first")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    py = str(ROOT / ".venv" / "Scripts" / "python.exe")
    recut = str(ROOT / "scripts" / "recut_lineup_clips.py")
    fails = []
    for m in manifest:
        cmd = [py, recut, m["id8"],
               "--stand", str(m["stand"][0]), str(m["stand"][1]),
               "--aim", str(m["aim"][0]), str(m["aim"][1]),
               "--throw", str(m["throw"][0]), str(m["throw"][1]),
               "--landing", str(m["landing"][0]), str(m["landing"][1]),
               "--chapter-end", str(m["ce_native"])]
        print(f"  RECUT id8={m['id8']} {m['name'][:34]!r} ce={m['ce_native']}")
        r = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
        if r.returncode != 0:
            fails.append((m["id8"], r.stderr.strip()[-300:]))
            print(f"    !! FAILED rc={r.returncode}: {r.stderr.strip()[-200:]}")
    print(f"\nRECUT done; {len(manifest)-len(fails)}/{len(manifest)} ok, {len(fails)} failed.")
    for id8, err in fails:
        print(f"  FAIL {id8}: {err}")


async def _amain(cmd: str) -> None:
    async with AsyncSessionLocal() as db:
        if cmd == "plan":
            await cmd_plan(db)
        elif cmd == "create":
            await cmd_create(db)
        elif cmd == "accept":
            await cmd_accept(db)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=["plan", "create", "recut", "accept"])
    args = ap.parse_args()
    if args.cmd == "recut":
        cmd_recut()
    else:
        asyncio.run(_amain(args.cmd))


if __name__ == "__main__":
    main()
