"""Read-only: dump a YouTube video's native chapters (start/end/title) via
yt-dlp, without downloading the video. Ground-truth before creating lineups.

Usage (backend cwd, main venv):
    python scripts/dump_chapters.py 588UtJa98F0
"""
import sys

import yt_dlp  # noqa: E402


def main() -> None:
    vid = sys.argv[1] if len(sys.argv) > 1 else "588UtJa98F0"
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


if __name__ == "__main__":
    main()
