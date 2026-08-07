"""GET-verify every media asset for a MAP (or one source video): real bytes, right container.

Presigned URLs are signed for GET — a HEAD probe returns 403 SignatureDoesNotMatch on every asset and
looks exactly like total media loss (two separate false alarms this campaign). Always GET, Range-limited
so whole clips are not pulled.

Upgraded 2026-07-29 from "is the body non-empty" to "is it the container it claims to be": an mp4 must
carry 'ftyp' in its first box, a webp must be RIFF....WEBP. A truncated object or an XML/HTML error
body is non-empty and would have passed the old length-only check.

  python verify_media.py --map sunset
  python verify_media.py <youtube_video_id>
"""
import collections
import json
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FIELDS = ("stand_clip_url", "aim_clip_url", "clip_url", "landing_clip_url",
          "stand_screenshot_url", "landing_screenshot_url")

if "--map" in sys.argv:
    mp = sys.argv[sys.argv.index("--map") + 1]
    api = (f"http://127.0.0.1:8004/api/lineups?game_slug=valorant&map_slug={mp}"
           f"&status=accepted&limit=5000")
    label = f"map={mp}"
    with urllib.request.urlopen(api, timeout=90) as fh:
        rows = json.load(fh)
else:
    vid = sys.argv[1]
    label = f"video={vid}"
    with urllib.request.urlopen(
            "http://127.0.0.1:8004/api/lineups?game_slug=valorant&limit=10000", timeout=90) as fh:
        rows = [r for r in json.load(fh) if r.get("youtube_video_id") == vid]

print(f"{label}: {len(rows)} accepted rows x {len(FIELDS)} fields "
      f"= {len(rows) * len(FIELDS)} assets\n")
if not rows:
    raise SystemExit("ABORT: no rows matched — nothing was verified (do not read this as a pass).")

bad, ok = [], 0
kinds = collections.Counter()
for r in rows:
    cs = r.get("chapter_start_seconds")
    for f in FIELDS:
        u = r.get(f)
        if not u:
            bad.append((cs, f, "EMPTY URL"))
            continue
        req = urllib.request.Request(u, headers={"Range": "bytes=0-2047"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                head = resp.read(2048)
        except urllib.error.HTTPError as ex:
            bad.append((cs, f, f"HTTP {ex.code}"))
            continue
        except Exception as ex:  # noqa: BLE001
            bad.append((cs, f, f"{type(ex).__name__}: {ex}"))
            continue
        if len(head) < 512:
            bad.append((cs, f, f"only {len(head)}B"))
        elif b"ftyp" in head[:64]:
            kinds["mp4"] += 1
            ok += 1
        elif head[:4] == b"RIFF" and head[8:12] == b"WEBP":
            kinds["webp"] += 1
            ok += 1
        elif head[:8] == b"\x89PNG\r\n\x1a\n":
            kinds["png"] += 1
            ok += 1
        else:
            bad.append((cs, f, f"unknown magic {head[:12]!r}"))

print(f"OK  {ok}   kinds={dict(kinds)}")
print(f"BAD {len(bad)}")
for cs, f, why in bad[:40]:
    print(f"   cs={cs} {f}: {why}")
sys.exit(1 if bad else 0)
