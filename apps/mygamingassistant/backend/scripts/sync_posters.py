r"""Local operator tool: pull a map's STAND/LANDING poster bytes from local MinIO
into a plain directory, so ``propose_pins.py extract --from-posters`` can read them.

Why this exists: the pin pipeline's other frame source (``--from-source``) needs a
cached YouTube download, and yt-dlp is currently walled behind a PO-token/bot check
(HTTP 403 on every media fetch). The posters, however, were already cut when the
lineups were ingested and still live in the local MinIO bucket — so pins can be
placed for the entire shipped library with no video access at all.

Reads the committed pack (``data/lineup_library.json``) to learn which object keys
a map's lineups reference, then streams each to ``<out>/<key>`` — the key's full
relative path, subdirectories and all. Basenames are unique only WITHIN one source
video (``pending/<video_id>/<chapter>-stand-poster.webp``), so a flat layout would
alias one video's chapter-7 frame onto another's; ``propose_pins._poster_path``
resolves the full key first for exactly this reason.

Idempotent: a file already present with a non-zero size is skipped, so re-running
after a partial pull is cheap.

Run from the backend dir with the app venv:
  .venv\Scripts\python.exe scripts\sync_posters.py --game valorant --map haven
  .venv\Scripts\python.exe scripts\sync_posters.py --map haven --out %TEMP%\mga-pin-posters\haven
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from minio import Minio  # noqa: E402
from minio.error import S3Error  # noqa: E402

from app.core.config import settings  # noqa: E402

_PACK = ROOT / "data" / "lineup_library.json"

# Only the two frames the pin localizer reads. Pulling the clips too would be
# ~50x the bytes for no benefit — the vision step never opens them.
POSTER_FIELDS = ("stand_screenshot_url", "landing_screenshot_url")


def _client() -> Minio:
    host = settings.minio_endpoint.replace("http://", "").replace("https://", "")
    return Minio(host, access_key=settings.minio_access_key,
                 secret_key=settings.minio_secret_key, secure=settings.minio_secure)


def _keys_for(game: str | None, map_slug: str | None) -> list[str]:
    pack = json.loads(_PACK.read_text(encoding="utf-8"))
    keys: list[str] = []
    for l in pack["lineups"]:
        if game and l.get("game_slug") != game:
            continue
        if map_slug and l.get("map_slug") != map_slug:
            continue
        for f in POSTER_FIELDS:
            v = l.get(f)
            if v:
                keys.append(v)
    return keys


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--game", default="valorant")
    ap.add_argument("--map", required=True)
    ap.add_argument("--out", help="target dir (default %TEMP%/mga-pin-posters/<map>)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    out = Path(args.out) if args.out else (
        Path(os.environ.get("TEMP", "/tmp")) / "mga-pin-posters" / args.map)
    keys = _keys_for(args.game, args.map)
    print(f"{len(keys)} poster key(s) referenced by {args.game}/{args.map} -> {out}")
    if args.dry_run:
        for k in keys[:5]:
            print("  ", k)
        return

    out.mkdir(parents=True, exist_ok=True)
    client = _client()
    bucket = settings.minio_bucket
    got = skipped = missing = 0
    for key in keys:
        dest = out / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.is_file() and dest.stat().st_size > 0:
            skipped += 1
            continue
        try:
            client.fget_object(bucket, key, str(dest))
            got += 1
        except S3Error as exc:
            # A key in the pack with no bytes in MinIO is a real gap worth naming,
            # not something to swallow — the lineup will simply get no pin.
            print(f"  MISSING {key}: {exc.code}")
            missing += 1
    print(f"pulled={got} already-present={skipped} missing={missing}")
    print(f"next: python scripts/propose_pins.py extract --game {args.game} "
          f"--map {args.map} --from-posters {out}")


if __name__ == "__main__":
    main()
