"""Publish the media of one or more MAPS from the exported lineup pack (MinIO -> R2).

Generalises the one-off publish_summit.py, which hard-coded a single map and a
scratchpad copy of the pack. Ship-time reality is that several maps go out in one
PR (summit + sunset + ascent in the 2026-07 sweep), and MGA auto-deploys on merge
to main — so every key those rows reference MUST already be in R2 BEFORE the merge,
or production serves 404s for the window between deploy and a follow-up publish.

R2 creds are read from scripts/.env.r2 into the env internally and are NEVER printed.
Pass --dry-run to preview (no creds needed).

  .venv/Scripts/python.exe scripts/publish_maps_to_r2.py summit sunset [--dry-run]

Run from the backend dir with the app venv (publish_clips_to_r2 imports settings,
which needs backend/.env).
"""
import json
import os
import sys
from pathlib import Path

BE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BE))
sys.path.insert(0, str(BE / "scripts"))

args = [a for a in sys.argv[1:] if not a.startswith("--")]
DRY = "--dry-run" in sys.argv[1:]
if not args:
    raise SystemExit(
        "ABORT - name at least one map slug. Publishing 'everything in the pack' would "
        "silently re-walk ~1200 rows of already-published media and make the ship-time "
        "key count meaningless as a check."
    )

if not DRY:
    envr2 = BE / "scripts" / ".env.r2"
    if not envr2.exists():
        raise SystemExit(f"ABORT - {envr2} not found; R2 credentials are required to publish.")
    for line in envr2.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip().strip('"').strip("'")

import publish_clips_to_r2 as P  # noqa: E402

pack_path = BE / "data" / "lineup_library.json"
pack = json.loads(pack_path.read_text(encoding="utf-8"))
known = sorted({l.get("map_slug") for l in pack["lineups"]})
unknown = [m for m in args if m not in known]
if unknown:
    raise SystemExit(f"ABORT - no rows for map(s) {unknown} in {pack_path}. Known: {known}")

subset = {"lineups": [l for l in pack["lineups"] if l.get("map_slug") in args]}
keys = P._collect_keys(subset)
print(f"{'DRY RUN - ' if DRY else ''}{'+'.join(args)}: {len(subset['lineups'])} lineups, {len(keys)} media keys")

src, src_bucket = P._source_client()
dst, dst_bucket = (None, None) if DRY else P._r2_client()
counts: dict[str, int] = {"copied": 0, "would-copy": 0, "missing": 0}
missing: list[str] = []
for i, k in enumerate(keys, 1):
    outcome = P._copy_key(src, src_bucket, dst, dst_bucket, k, dry_run=DRY)
    counts[outcome] = counts.get(outcome, 0) + 1
    if outcome == "missing":
        missing.append(k)
    if i % 200 == 0:
        print(f"  ... {i}/{len(keys)}")

print(f"Done: copied={counts['copied']} would-copy={counts['would-copy']} missing={counts['missing']}")
if missing:
    # Missing keys are a SHIP BLOCKER, not a warning: the row will render a broken
    # clip in production. Print them so the recut/backfill can be targeted.
    print(f"\nMISSING ({len(missing)}) - these rows would 404 in production:")
    for k in missing[:60]:
        print("  " + k)
    if len(missing) > 60:
        print(f"  ... and {len(missing) - 60} more")
    raise SystemExit(1)
