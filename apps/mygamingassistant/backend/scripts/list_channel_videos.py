"""Read-only video discovery via yt-dlp (flat = fast, no per-video processing).

Two modes:
  python scripts/list_channel_videos.py --from-video <video_id> [N]
      resolve the channel that posted <video_id>, list its newest N videos
  python scripts/list_channel_videos.py "<channel_or_playlist_url_or_@handle>" [N]
      list newest N videos for that channel/playlist
  python scripts/list_channel_videos.py --search "<query>" [N]
      YouTube search, newest-first (ytsearchdate)

Prints id, duration, and title (newest first). Use dump_chapters.py on a
candidate to confirm upload_date + per-lineup chapter structure.
"""
import sys

import yt_dlp  # noqa: E402

_FLAT = {"quiet": True, "skip_download": True, "extract_flat": True}


def _channel_videos_url(video_id: str) -> str:
    with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True}) as y:
        info = y.extract_info(
            f"https://www.youtube.com/watch?v={video_id}",
            download=False, process=False,
        )
    url = (info.get("channel_url") or info.get("uploader_url") or "").rstrip("/")
    if not url:
        raise SystemExit(f"could not resolve channel for {video_id}")
    return url + "/videos"


def main() -> None:
    args = sys.argv[1:]
    if not args:
        raise SystemExit("usage: see module docstring")

    if args[0] == "--from-video":
        target = _channel_videos_url(args[1])
        n = int(args[2]) if len(args) > 2 else 40
    elif args[0] == "--search":
        n = int(args[2]) if len(args) > 2 else 40
        target = f"ytsearchdate{n}:{args[1]}"
    else:
        target = args[0]
        if "youtube.com" in target and "/videos" not in target and "list=" not in target:
            target = target.rstrip("/") + "/videos"
        n = int(args[1]) if len(args) > 1 else 40

    opts = dict(_FLAT, playlistend=n)
    with yt_dlp.YoutubeDL(opts) as y:
        info = y.extract_info(target, download=False)
    entries = info.get("entries") or []
    print(f"== {info.get('title') or info.get('channel') or target} ==")
    print(f"{len(entries)} videos (newest first):")
    for e in entries:
        if not e:
            continue
        dur = e.get("duration")
        durs = f"{int(dur // 60)}:{int(dur % 60):02d}" if dur else "  ?  "
        print(f"  {e.get('id'):12}  {durs:>6}  {e.get('title')}")


if __name__ == "__main__":
    main()
