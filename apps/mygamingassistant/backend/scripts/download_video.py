"""Download a YouTube video into the frame-study cache
(%TEMP%/mga-debug-source/<vid>.mp4) — the SAME dir frame_study.py and
recut_lineup_clips.py read from. Mirrors the pipeline's
youtube_fetcher.download_video format opts. Idempotent (skips if present).

Usage (backend cwd, main venv):
    python scripts/download_video.py 588UtJa98F0
"""
import os
import sys
from pathlib import Path

import yt_dlp  # noqa: E402

VIDEO_DIR = Path(os.environ["TEMP"]) / "mga-debug-source"


def main() -> None:
    vid = sys.argv[1] if len(sys.argv) > 1 else None
    if not vid:
        raise SystemExit("usage: python scripts/download_video.py <video_id>")
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    out = VIDEO_DIR / f"{vid}.mp4"
    if out.exists():
        print(f"already cached: {out} ({out.stat().st_size / 1e6:.0f} MB)")
        return
    opts = {
        "format": "bestvideo*+bestaudio/best",
        "merge_output_format": "mp4",
        "outtmpl": str(VIDEO_DIR / f"{vid}.%(ext)s"),
        "quiet": True,
        "noprogress": True,
    }
    print(f"downloading {vid} -> {VIDEO_DIR} ...")
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={vid}"])
    if out.exists():
        print(f"DONE -> {out} ({out.stat().st_size / 1e6:.0f} MB)")
    else:
        print("download finished but expected .mp4 not found — check the dir")


if __name__ == "__main__":
    main()
