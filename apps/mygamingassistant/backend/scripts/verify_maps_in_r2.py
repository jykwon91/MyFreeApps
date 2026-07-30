"""Verify that every media key the pack references for the named MAPS is present in R2.

publish_maps_to_r2.py reports what it COPIED; this reports what is actually THERE.
The two are not the same claim, and the difference matters because MGA auto-deploys
on merge to main: a publish that died halfway (crashed box, killed shell, lost task
handle) still prints nothing wrong, and the first symptom would be 404s in production.

Read-only — issues one stat_object per key against R2, copies nothing.

  .venv/Scripts/python.exe scripts/verify_maps_in_r2.py summit sunset ascent

Exit 0 = every key present. Exit 1 = at least one missing (names printed).
Run from the backend dir with the app venv. R2 creds come from scripts/.env.r2
into the env internally and are NEVER printed.
"""
import json
import os
import sys
from pathlib import Path

BE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BE))
sys.path.insert(0, str(BE / "scripts"))

maps = [a for a in sys.argv[1:] if not a.startswith("--")]
if not maps:
    raise SystemExit("ABORT - name at least one map slug to verify.")

envr2 = BE / "scripts" / ".env.r2"
if not envr2.exists():
    raise SystemExit(f"ABORT - {envr2} not found; R2 credentials are required to verify.")
for line in envr2.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ[k.strip()] = v.strip().strip('"').strip("'")

from minio.error import S3Error  # noqa: E402

import publish_clips_to_r2 as P  # noqa: E402

pack = json.loads((BE / "data" / "lineup_library.json").read_text(encoding="utf-8"))
known = sorted({l.get("map_slug") for l in pack["lineups"]})
unknown = [m for m in maps if m not in known]
if unknown:
    raise SystemExit(f"ABORT - no rows for map(s) {unknown}. Known: {known}")

subset = {"lineups": [l for l in pack["lineups"] if l.get("map_slug") in maps]}
keys = P._collect_keys(subset)
dst, bucket = P._r2_client()
print(f"Verifying {len(keys)} key(s) for {'+'.join(maps)} in R2 ...")

missing: list[str] = []
for i, key in enumerate(keys, 1):
    try:
        dst.stat_object(bucket, key)
    except S3Error as exc:
        if exc.code in ("NoSuchKey", "NoSuchObject"):
            missing.append(key)
        else:
            raise
    if i % 250 == 0:
        print(f"  ... {i}/{len(keys)} checked, {len(missing)} missing so far", flush=True)

print(f"\nPresent: {len(keys) - len(missing)}/{len(keys)}")
if missing:
    print(f"MISSING ({len(missing)}) - these would 404 in production; re-run publish_maps_to_r2.py:")
    for key in missing[:60]:
        print("  " + key)
    if len(missing) > 60:
        print(f"  ... and {len(missing) - 60} more")
    raise SystemExit(1)
print("All keys present - safe to merge.")
