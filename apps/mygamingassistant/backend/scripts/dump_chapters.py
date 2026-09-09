"""Read-only: dump a YouTube video's native chapters (start/end/title) via
yt-dlp, without downloading the video. Ground-truth before creating lineups.

Usage (backend cwd, main venv):
    python scripts/dump_chapters.py 588UtJa98F0
    python scripts/dump_chapters.py cTrav7nTu2Y --json <scratch>/chapters_abyss.json

``--json`` writes the chapters file ``build_items.py`` reads. That file used to be
produced by hand for every bucket, which is how a hand-typed items list carried
invented timestamps on the Summit source; deriving it straight from the yt-dlp
metadata removes the transcription step entirely. The schema is exactly what
``build_items.py`` consumes -- ``video_id`` (checked against the ``--cards`` file),
``duration``, ``author``, and one ``{cs, end, title}`` per chapter.
"""
import json
import sys
from pathlib import Path

import yt_dlp  # noqa: E402


def main() -> None:
    argv = sys.argv[1:]
    out = None
    if "--json" in argv:
        i = argv.index("--json")
        out, argv = Path(argv[i + 1]), argv[:i] + argv[i + 2:]
    vid = argv[0] if argv else "588UtJa98F0"
    url = f"https://www.youtube.com/watch?v={vid}"
    with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True}) as ydl:
        info = ydl.extract_info(url, download=False)
    chapters = info.get("chapters") or []
    dur = info.get("duration")
    print(f"== {vid} : {info.get('title')!r} ==")
    print(f"   uploader={info.get('uploader')!r}  upload_date={info.get('upload_date')}  "
          f"duration={dur}s  chapters={len(chapters)}")
    print(f"{'#':>3} {'start':>8} {'end':>8} {'len':>6}  title")
    print("-" * 70)
    for i, c in enumerate(chapters):
        s = c.get("start_time")
        e = c.get("end_time")
        ln = (e - s) if (s is not None and e is not None) else None
        print(f"{i:>3} {s:>8.1f} {e:>8.1f} {ln:>6.1f}  {c.get('title')!r}")

    if out is None:
        return
    if not chapters:
        raise SystemExit(f"\nABORT - {vid} has no native chapters; there is nothing to write.")
    doc = {
        "video_id": vid,
        "duration": dur,
        # "uploader", not "author": build_items.py reads `ch.get("uploader")` for the pack's
        # attribution, and a mismatched key here silently ships every row as author "unknown".
        "uploader": info.get("uploader"),
        "title": info.get("title"),
        "chapters": [{"cs": int(c["start_time"]), "end": int(c["end_time"]),
                      "title": (c.get("title") or "").strip()} for c in chapters],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n-> {out}  ({len(doc['chapters'])} chapters)")


if __name__ == "__main__":
    main()
