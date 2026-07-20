"""Probe YouTube video metadata (title, upload_date, duration, chapters)
WITHOUT downloading. Usage: python scripts/probe_video.py <vid> [<vid> ...]"""
import sys
import yt_dlp

for vid in sys.argv[1:]:
    opts = {"quiet": True, "skip_download": True, "noprogress": True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
    except Exception as e:
        print(f"=== {vid} === ERROR: {e}\n")
        continue
    chapters = info.get("chapters") or []
    print(f"=== {vid} ===")
    print(f"  title: {info.get('title')}")
    print(f"  channel: {info.get('channel')}")
    print(f"  upload_date: {info.get('upload_date')}")
    print(f"  duration: {info.get('duration')}s")
    print(f"  chapters: {len(chapters)}")
    for c in chapters:
        print(f"    {c.get('start_time'):7.1f}  {c.get('title')}")
    print()
