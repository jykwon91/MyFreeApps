"""Propose minimap STAND + TARGET pins for lineups, to slash manual pin volume.

The multi-source backfill needs fine minimap anchors (see dedup_lineups.py), but
the pack has none (stand/target anchors null for all lineups) and placing 2 pins
per lineup by hand across ~870 lineups is the bottleneck. This tool pre-places
both pins so the operator only NUDGES a near-right pin in MinimapPinEditor
instead of placing from a blank minimap.

Approach (validated 2026-07-20): NOT classical CV — the in-game minimap is faint,
low-detail, and player-rotated, so arrow-detection + registration is brittle.
Instead an LLM vision localizer reads the STAND/LANDING frame + our reference
minimap + the lineup's known zone (a hard prior) and places a normalized pin, the
same way a human studying the frame does. Output feeds MinimapPinEditor via the
existing anchor plumbing (stand_anchor_*/target_anchor_* round-trip through
LINEUP_SCALAR_FIELDS end-to-end — no app change needed).

STAND pins are strong (player marker + callouts). TARGET pins are weaker — a
utility's landing isn't marked on the in-game minimap — so target proposals are
flagged low-confidence for the operator to scrutinize.

Pipeline (three deterministic modes here; the vision step is a subagent fan-out
driven by PROPOSE_PINS_INSTRUCTIONS.md between `extract` and `apply`):

  1. extract  — pull a STAND + LANDING frame per lineup, write <map>-pin-requests.json
  2. (vision) — fan out localizers reading the requests -> <map>-pin-proposals.json
  3. apply    — write proposed anchors into data/lineup_library.json (by lineup id)
     render   — overlay proposed pins on the reference minimap for eyeball QA

Frame sources for `extract`:
  --from-source <video.mp4> --spans <agent-spans/<map>.json>
        Extract from a cached source video using the span windows (STAND + LANDING).
        Join pack lineup <-> span row by (youtube_video_id, chapter_start_seconds==cs).
        Use when MinIO is down but the source + spans exist (e.g. dev/backfill).
  --from-posters <dir>
        Read each lineup's already-cut stand/landing poster WebPs from a local dir
        (keys = stand_screenshot_url / landing_screenshot_url). Use when the posters
        have been synced locally. Works for any bucket, both frames, no source needed.

Usage:
  python scripts/propose_pins.py extract --game valorant --map ascent \
      --from-source %TEMP%/mga-debug-source/mPE6_-Cip_M.mp4 --spans scripts/kay-o-spans/ascent.json
  python scripts/propose_pins.py apply  --map ascent --proposals ascent-pin-proposals.json
  python scripts/propose_pins.py render --map ascent --proposals ascent-pin-proposals.json
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

# Repo-relative anchors (path-clean for the public repo — derive, never hardcode).
_BACKEND = Path(__file__).resolve().parents[1]
_PACK = _BACKEND / "data" / "lineup_library.json"
_SCRIPTS = _BACKEND / "scripts"


def _load_pack() -> dict:
    return json.loads(_PACK.read_text(encoding="utf-8"))


def _pack_lineups(pack: dict, game: str | None, map_slug: str | None,
                  video: str | None) -> list[dict]:
    out = pack["lineups"]
    if game:
        out = [l for l in out if l.get("game_slug") == game]
    if map_slug:
        out = [l for l in out if l.get("map_slug") == map_slug]
    if video:
        out = [l for l in out if l.get("youtube_video_id") == video]
    return out


def _reference_minimap(pack: dict, game: str, map_slug: str) -> Path:
    """Our stored north-up minimap image for this map (the pin coordinate space)."""
    return (_BACKEND.parent / "frontend" / "public" / "minimaps"
            / game / f"{map_slug}.png")


def _ffmpeg_frame(video: Path, t_seconds: float, out: Path) -> bool:
    """Grab a single frame at t_seconds. Returns True on success."""
    out.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["ffmpeg", "-y", "-ss", f"{t_seconds:.2f}", "-i", str(video),
         "-frames:v", "1", str(out)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return r.returncode == 0 and out.is_file()


def _span_index(spans_path: Path) -> dict[int, dict]:
    """Map chapter-start-seconds (cs) -> span row, from an <agent>-spans/<map>.json."""
    data = json.loads(spans_path.read_text(encoding="utf-8"))
    return {int(row["cs"]): row for row in data.get("lineups", [])}


def _mid(span: list) -> float:
    return (float(span[0]) + float(span[1])) / 2.0


def cmd_extract(args) -> None:
    pack = _load_pack()
    lineups = _pack_lineups(pack, args.game, args.map, args.video)
    if not lineups:
        raise SystemExit("no matching lineups in pack")

    work = Path(args.workdir) if args.workdir else Path(
        tempfile.gettempdir()) / "mga-pin-frames" / (args.map or "all")
    work.mkdir(parents=True, exist_ok=True)

    requests = []
    if args.from_source:
        video = Path(os.path.expandvars(args.from_source))
        if not video.is_file():
            raise SystemExit(f"source video not found: {video}")
        spans = _span_index(Path(args.spans)) if args.spans else {}
        for l in lineups:
            cs = l.get("chapter_start_seconds")
            row = spans.get(int(cs)) if cs is not None else None
            # STAND: use span stand window midpoint if we have it, else cs itself.
            stand_t = _mid(row["spans"]["stand"]) if row else float(cs or 0)
            land_t = _mid(row["spans"]["landing"]) if row else None
            sf = work / f"{l['id']}-stand.png"
            _ffmpeg_frame(video, stand_t, sf)
            lf = None
            if land_t is not None:
                lf = work / f"{l['id']}-landing.png"
                _ffmpeg_frame(video, land_t, lf)
            requests.append(_request_row(l, sf, lf))
    elif args.from_posters:
        pdir = Path(args.from_posters)
        for l in lineups:
            sf = _poster_path(pdir, l.get("stand_screenshot_url"))
            lf = _poster_path(pdir, l.get("landing_screenshot_url"))
            requests.append(_request_row(l, sf, lf))
    else:
        raise SystemExit("choose a frame source: --from-source or --from-posters")

    out = _SCRIPTS / f"{args.map or 'all'}-pin-requests.json"
    payload = {
        "game": args.game, "map": args.map,
        "reference_minimap": str(_reference_minimap(pack, args.game or "valorant",
                                                     args.map or "")),
        "requests": requests,
    }
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    n_stand = sum(1 for r in requests if r["stand_frame"])
    n_land = sum(1 for r in requests if r["landing_frame"])
    print(f"extracted frames for {len(requests)} lineups "
          f"(stand={n_stand}, landing={n_land}) -> {out}")
    print(f"next: fan out vision localizers per PROPOSE_PINS_INSTRUCTIONS.md, "
          f"write {args.map}-pin-proposals.json, then `apply`.")


def _poster_path(pdir: Path, key: str | None) -> Path | None:
    """Resolve a pack object key to a synced poster file under ``pdir``.

    Prefer the key's FULL relative path. Poster basenames are only unique within
    one source video (``pending/<video_id>/<chapter>-stand-poster.webp``), so a
    flat basename lookup silently hands the localizer another video's frame for
    every colliding chapter number — 66 of Ascent's 482 keys collide. The
    basename fallback keeps older flat poster dirs working.
    """
    if not key:
        return None
    for cand in (pdir / key, pdir / Path(key).name):
        if cand.is_file():
            return cand
    return None


def _request_row(l: dict, stand_frame: Path | None, landing_frame: Path | None) -> dict:
    return {
        "lineup_id": l["id"],
        "title": l.get("chapter_title"),
        "utility_type_slug": l.get("utility_type_slug"),
        "side": l.get("side"),
        "stand_zone_slug": l.get("stand_zone_slug"),
        "target_zone_slug": l.get("target_zone_slug"),
        "stand_frame": str(stand_frame) if stand_frame else None,
        "landing_frame": str(landing_frame) if landing_frame else None,
    }


def _load_proposals(path: str) -> dict[str, dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = data.get("proposals", data) if isinstance(data, dict) else data
    return {r["lineup_id"]: r for r in rows}


_FIXTURES = _BACKEND / "app" / "fixtures" / "valorant_maps.json"


def _zone_centroids(map_slug: str) -> dict[str, tuple[float, float]]:
    """Centroid of every seeded zone box on a map, keyed by slug."""
    blocks = json.loads(_FIXTURES.read_text(encoding="utf-8"))
    for block in blocks:
        for m in block.get("maps", []):
            if m["slug"] != map_slug:
                continue
            out = {}
            for z in m["zones"]:
                pts = z["polygon_points"]
                out[z["slug"]] = (sum(q["x"] for q in pts) / len(pts),
                                  sum(q["y"] for q in pts) / len(pts))
            return out
    return {}


def cmd_apply(args) -> None:
    pack = _load_pack()
    proposals = _load_proposals(args.proposals)
    # The HUD minimap marks the PLAYER, never where a utility lands, so a vision
    # pass over stand frames yields strong stand pins and no target evidence at
    # all. --target-fallback offers the target zone's centroid instead, but it is
    # off by default and should usually stay off: LineupRead.effective_target_x
    # already derives that exact centroid at read time, and MapLineupPins draws
    # it as isGuess because target_anchor_x is null. Writing it into the pack
    # moves no pin — it only sets target_anchor_x, which is precisely the flag
    # that says "an operator placed this". The screen looks identical and the
    # honesty is gone. Leave targets unpinned until there is real landing
    # evidence for them.
    centroids = _zone_centroids(args.map) if args.target_fallback else {}
    changed = filled = 0
    for l in pack["lineups"]:
        p = proposals.get(l["id"])
        if not p:
            continue
        if p.get("stand"):
            l["stand_anchor_x"] = round(float(p["stand"]["x"]), 4)
            l["stand_anchor_y"] = round(float(p["stand"]["y"]), 4)
        if p.get("target"):
            l["target_anchor_x"] = round(float(p["target"]["x"]), 4)
            l["target_anchor_y"] = round(float(p["target"]["y"]), 4)
        elif centroids.get(l.get("target_zone_slug")):
            cx, cy = centroids[l["target_zone_slug"]]
            l["target_anchor_x"] = round(cx, 4)
            l["target_anchor_y"] = round(cy, 4)
            filled += 1
        changed += 1
    if filled:
        print(f"  {filled} target pin(s) filled from the target zone's centroid")
    if args.dry_run:
        print(f"[dry-run] would set anchors on {changed} lineups (no write)")
        return
    # ensure_ascii=False to match export_lineup_pack.py: the pack stores em-dashes
    # as literal UTF-8, and escaping them here rewrites 189 unrelated title lines.
    _PACK.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + "\n",
                     encoding="utf-8")
    print(f"wrote proposed anchors onto {changed} lineups in {_PACK.name}. "
          f"Import locally + eyeball/nudge in MinimapPinEditor before shipping.")


def cmd_render(args) -> None:
    from PIL import Image, ImageDraw, ImageFont
    pack = _load_pack()
    proposals = _load_proposals(args.proposals)
    ref = _reference_minimap(pack, args.game or "valorant", args.map or "")
    img = Image.open(ref).convert("RGBA")
    W, H = img.size
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except Exception:
        font = ImageFont.load_default()
    by_id = {l["id"]: l for l in pack["lineups"]}
    r = 9
    for lid, p in proposals.items():
        l = by_id.get(lid, {})
        if p.get("stand"):
            px, py = int(p["stand"]["x"] * W), int(p["stand"]["y"] * H)
            d.ellipse([px-r, py-r, px+r, py+r], fill=(40, 120, 255, 255),
                      outline=(255, 255, 255, 255), width=2)
        if p.get("target"):
            # low-confidence target -> lighter/hollow so the operator scrutinizes it
            tx, ty = int(p["target"]["x"] * W), int(p["target"]["y"] * H)
            lowconf = (p["target"].get("confidence") == "low")
            d.ellipse([tx-r, ty-r, tx+r, ty+r],
                      fill=(255, 170, 40, 120 if lowconf else 255),
                      outline=(255, 140, 0, 255), width=2)
            if p.get("stand"):
                d.line([px, py, tx, ty], fill=(255, 255, 255, 90), width=1)
    out = Path(args.out) if args.out else (
        Path(tempfile.gettempdir()) / f"{args.map}-proposed-pins.png")
    img.convert("RGB").save(out)
    print(f"rendered {len(proposals)} lineups (blue=stand, orange=target, "
          f"faded=low-conf target) -> {out}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("extract", help="pull stand+landing frames per lineup")
    e.add_argument("--game", default="valorant")
    e.add_argument("--map")
    e.add_argument("--video", help="restrict to one youtube_video_id")
    e.add_argument("--from-source", help="cached source video (mp4)")
    e.add_argument("--spans", help="<agent>-spans/<map>.json for stand/landing windows")
    e.add_argument("--from-posters", help="local dir holding the lineup poster webps")
    e.add_argument("--workdir", help="where to write extracted frames")
    e.set_defaults(func=cmd_extract)

    a = sub.add_parser("apply", help="write proposed anchors into the pack")
    a.add_argument("--map")
    a.add_argument("--proposals", required=True)
    a.add_argument("--dry-run", action="store_true")
    a.add_argument("--target-fallback", action="store_true",
                   help="fill any missing target pin with its target zone's "
                        "centroid. RARELY WHAT YOU WANT: LineupRead.effective_"
                        "target_x already derives that same centroid at read "
                        "time and the map flags it isGuess, so writing it into "
                        "the pack changes nothing on screen except to relabel "
                        "an honest guess as a confirmed pin")
    a.set_defaults(func=cmd_apply)

    r = sub.add_parser("render", help="overlay proposed pins on the reference minimap")
    r.add_argument("--game", default="valorant")
    r.add_argument("--map", required=True)
    r.add_argument("--proposals", required=True)
    r.add_argument("--out")
    r.set_defaults(func=cmd_render)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
