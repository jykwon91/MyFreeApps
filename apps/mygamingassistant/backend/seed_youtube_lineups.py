"""One-off dev seeder: parse a YouTube CS2 lineup video and insert lineups directly.

Bypasses MinIO + the Claude classifier — just stuffs chapter metadata into the DB
as `accepted` lineups so the library has visible content.

Usage:
    python seed_youtube_lineups.py <youtube_url>
"""
from __future__ import annotations

import asyncio
import re
import sys
import uuid
from datetime import datetime, timezone

import yt_dlp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal as async_session_maker
from app.models.game.game import Game
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.source import Source
from app.models.game.utility_type import UtilityType
from app.models.game.lineup import Lineup


MIRAGE_ZONE_KEYWORDS = {
    "a-palace": ["palace"],
    "a-ramp":   ["ramp", "a ramp"],
    "a-site":   ["a site", "a-site", "ticket", "jungle", "stairs", "default plant"],
    "b-apts":   ["b apt", "b apartments", "apts"],
    "b-site":   ["b site", "b-site", "market", "van"],
    "b-van":    ["van"],
    "catwalk":  ["catwalk", "cat"],
    "ct-spawn": ["ct spawn", "ct-spawn", "ct ", "ticket/ct"],
    "mid":      ["mid", "connector", "window", "top mid", "mid cross"],
    "t-spawn":  ["t spawn", "t-spawn", "t side"],
}


def match_zone_slug(text: str) -> str | None:
    """Return the best-matching zone slug for a fragment of a chapter title."""
    if not text:
        return None
    lowered = text.lower()
    # check more-specific slugs first (longer keywords win)
    candidates = sorted(MIRAGE_ZONE_KEYWORDS.items(), key=lambda kv: -max(len(k) for k in kv[1]))
    for slug, keywords in candidates:
        if any(kw in lowered for kw in keywords):
            return slug
    return None


def parse_chapter(title: str) -> tuple[str | None, str | None]:
    """From a chapter title like 'Mid Window from T Spawn' return (target_slug, stand_slug).

    Two patterns supported:
      'TARGET from STAND'       -> ("mid", "t-spawn")
      'STAND - TARGET'          -> ("t-spawn", "mid")  but in this video the convention
      is actually 'STAND - SITE', e.g. 'Catwalk - B Site' means stand=Catwalk, target=B Site.
    """
    if " from " in title.lower():
        left, right = re.split(r"\s+from\s+", title, maxsplit=1, flags=re.IGNORECASE)
        return match_zone_slug(left), match_zone_slug(right)
    if " - " in title:
        left, right = title.split(" - ", 1)
        return match_zone_slug(right), match_zone_slug(left)
    return match_zone_slug(title), None


def infer_side(stand_slug: str | None) -> str:
    """T-side throws -> side_a, CT-side throws -> side_b, else side_a."""
    if stand_slug in ("ct-spawn", "a-site", "b-site"):
        # Lineups thrown from defensive positions = CT
        return "side_b"
    return "side_a"


async def main(youtube_url: str) -> None:
    # 1. Fetch metadata via yt-dlp
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
        info = ydl.extract_info(youtube_url, download=False)
    video_id = info["id"]
    title = info.get("title", "")
    channel = info.get("uploader", "")
    chapters = info.get("chapters") or []
    chapters = [c for c in chapters if not re.search(r"intro|outro", c.get("title", ""), re.IGNORECASE)]

    print(f"Video: {title}")
    print(f"Channel: {channel}")
    print(f"Chapters to import: {len(chapters)}")

    async with async_session_maker() as session:  # type: AsyncSession
        # 2. Resolve fixture IDs
        game = (await session.execute(select(Game).where(Game.slug == "cs2"))).scalar_one()
        map_ = (await session.execute(select(Map).where(Map.slug == "mirage"))).scalar_one()
        smoke = (
            await session.execute(
                select(UtilityType).where(UtilityType.game_id == game.id, UtilityType.slug == "smoke")
            )
        ).scalar_one()

        zones_by_slug = {
            z.slug: z
            for z in (await session.execute(select(MapZone).where(MapZone.map_id == map_.id))).scalars().all()
        }

        # 3. Upsert a Source row for this video
        existing = (
            await session.execute(
                select(Source).where(Source.config_json["video_id"].astext == video_id)
            )
        ).scalar_one_or_none()
        if existing is None:
            source = Source(
                id=uuid.uuid4(),
                kind="manual",
                config_json={"video_id": video_id, "url": youtube_url, "channel": channel, "imported_via": "seed_youtube_lineups"},
                last_synced_at=datetime.now(timezone.utc),
                created_at=datetime.now(timezone.utc),
            )
            session.add(source)
            await session.flush()
        else:
            source = existing

        # 4. Insert lineups
        inserted = 0
        for ch in chapters:
            ch_title = ch.get("title", "").strip()
            start = int(ch.get("start_time", 0))
            target_slug, stand_slug = parse_chapter(ch_title)
            target_zone = zones_by_slug.get(target_slug) if target_slug else None
            stand_zone = zones_by_slug.get(stand_slug) if stand_slug else None

            # Accepted requires all four classification fields set per ck_lineup_accepted_classified.
            # Fall back to a-site/t-spawn if we couldn't map; the operator can edit later.
            if target_zone is None:
                target_zone = zones_by_slug.get("a-site")  # safe fallback
            if stand_zone is None:
                stand_zone = zones_by_slug.get("t-spawn")  # safe fallback

            side = infer_side(stand_slug)

            session.add(
                Lineup(
                    id=uuid.uuid4(),
                    game_id=game.id,
                    map_id=map_.id,
                    target_zone_id=target_zone.id,
                    stand_zone_id=stand_zone.id,
                    side=side,
                    utility_type_id=smoke.id,
                    title=ch_title,
                    notes=f"Auto-imported from chapter at {start}s — operator should verify zones",
                    chapter_start_seconds=start,
                    chapter_title=ch_title,
                    youtube_video_id=video_id,
                    source_id=source.id,
                    attribution_url=f"https://youtu.be/{video_id}?t={start}",
                    attribution_author=channel,
                    status="accepted",
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
            )
            inserted += 1
            print(f"  [{start:4d}s] {ch_title!r:55s} -> stand={stand_zone.slug:10s} target={target_zone.slug:10s} side={side}")

        await session.commit()
    print(f"\nInserted {inserted} lineups.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python seed_youtube_lineups.py <youtube_url>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
