"""Verify a lineup's 4 served storyboard clips: download each from MinIO and
ffprobe its duration. Read-only — objective check that a re-cut produced valid,
correctly-sized MP4s. Reusable across the Initiative-7 sweep.

Usage (main venv, cwd=backend):  python scripts/verify_clips.py 45d89ec3
"""
import asyncio
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text  # noqa: E402
from app.core.storage import get_storage  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.game.lineup import Lineup  # noqa: E402
from app.services.ingestion.frame_extractor import probe_duration  # noqa: E402

_PANES = [
    ("STAND", "stand_clip_url"),
    ("AIM", "aim_clip_url"),
    ("THROW", "clip_url"),
    ("LANDING", "landing_clip_url"),
]


async def _probe_key(storage, key: str) -> str:
    if not key:
        return "MISSING (NULL)"
    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(None, storage.download_file, key)
    except Exception as exc:  # noqa: BLE001
        return f"DOWNLOAD FAILED: {exc}"
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(data)
        p = Path(tmp.name)
    try:
        dur = await probe_duration(p)
        return f"{dur:.3f}s  ({len(data)} bytes)"
    finally:
        p.unlink(missing_ok=True)


async def main() -> None:
    prefix = sys.argv[1] if len(sys.argv) > 1 else "45d89ec3"
    async with AsyncSessionLocal() as db:
        lid = (await db.execute(text(
            "SELECT id FROM lineup WHERE substr(id::text,1,8)=:p"
        ), {"p": prefix})).scalar_one_or_none()
        if lid is None:
            raise SystemExit(f"lineup id8={prefix} not found")
        lineup = (await db.execute(select(Lineup).where(Lineup.id == lid))).scalar_one()
        storage = get_storage()
        print(f"== {str(lid)[:8]} {lineup.title!r} — served clip durations ==")
        for label, attr in _PANES:
            key = getattr(lineup, attr)
            print(f"  {label:8} {await _probe_key(storage, key)}  <- {key}")


asyncio.run(main())
