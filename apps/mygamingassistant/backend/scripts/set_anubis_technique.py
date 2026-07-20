"""Set technique='Standing' on the Anubis (et6AZ5a5k3I) lineups — display-only
footer text. Every lineup was frame-study-classified as a STANDING throw
(no jump hump / strafe sweep / run flow), incl. #15 which the source brief
expected to be a jumpthrow. The LMB/RMB throw-STRENGTH is NOT recoverable from
view motion (per the cs2-lineup-expert reference), so it is intentionally
omitted — the footer shows the motion class only.

By default this sets ALL 15 et6 lineups. #6 (aed96742, DEEP MID CROSS) was
localized in a PRIOR session without a recorded technique; standing is
near-certain for a positional mid smoke, but pass --skip-prior to leave it
untouched if you'd rather verify it first.

Idempotent. Run via the main venv, cwd = backend:
  python scripts/set_anubis_technique.py [--skip-prior] [--dry-run]
"""
import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402

VALUE = "Standing"
PRIOR_ID8 = "aed96742"  # #6, localized in a prior session


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--skip-prior", action="store_true",
                    help="leave #6 aed96742 (prior-session localize) untouched")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Lineup).where(Lineup.youtube_video_id == "et6AZ5a5k3I")
            .order_by(Lineup.chapter_start_seconds)
        )).scalars().all()
        n = 0
        for l in rows:
            if args.skip_prior and str(l.id).startswith(PRIOR_ID8):
                print(f"  skip {str(l.id)[:8]} {l.title!r} (prior session)")
                continue
            print(f"  {str(l.id)[:8]} {l.title!r:34} technique: {l.technique!r} -> {VALUE!r}")
            if not args.dry_run:
                l.technique = VALUE
                n += 1
        if not args.dry_run:
            await db.commit()
        print(f"\n{'DRY-RUN — no writes' if args.dry_run else f'set technique={VALUE!r} on {n} lineups'}")


asyncio.run(main())
