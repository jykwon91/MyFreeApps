"""Per-pane on-demand widen-source service.

The widen-source backfill (:mod:`widen_source_backfill`) is the bulk
operation: walk every legacy-posture row and widen them all. This service
is its one-row sibling — the operator clicks "Widen source" in the trim
editor and we re-fetch the YouTube video for THIS pane, cut a wider clip
via the shared :func:`cut_and_upload_wide_source` helper, and update
``*_url_original`` so the next trim can drag past the previous bounds.

End-to-end:

  1. Validate pane (only throw / landing are trimmable — same allow-list
     :mod:`pane_trim_service` uses).
  2. Validate lineup has a YouTube source — manual uploads can't be widened
     because there's no video to re-fetch.
  3. One yt-dlp metadata fetch + one yt-dlp download for this single video
     (we never share with sibling calls — by definition this is a one-row
     op).
  4. Find the chapter via exact ``chapter_start_seconds`` match; 404 if the
     video's chapters changed since ingest (same posture as the backfill).
  5. Cut + upload the wider clip via the shared helper. Storage key is the
     same deterministic ``-clip-source`` / ``-landing-source`` shape the
     backfill uses, so a sequence of on-demand widens + a subsequent backfill
     run cleanly converge on the same bytes — no orphans.
  6. Persist ONLY ``*_url_original`` via the corresponding setter. The served
     tight ``*_url`` and the operator's existing trim offsets stay intact.
  7. Return the admin-shape LineupRead so the frontend can rebind the slider
     to the (possibly wider) bounds without a separate fetch.

Failures (per rules/check-third-party-error-codes.md): yt-dlp errors
surface as 502 with the structured error_type; ffmpeg/MinIO failures from
the helper surface as 500 with the captured error_codes. Never a silent
fail-through.

Note on idempotence: re-running widen-source on the same pane overwrites
the same deterministic MinIO key (no orphan) and rewrites
``*_url_original`` to the same value (no DB change in steady state). If
the operator wants MORE padding than the current env defaults, they bump
``CLIP_SOURCE_PRE_SECONDS`` / ``CLIP_SOURCE_POST_SECONDS`` and call this
endpoint again — the new wider bytes overwrite the old key in place.
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.game.lineup import Lineup
from app.repositories.game.lineup_repo import (
    set_clip_url_original,
    set_landing_clip_url_original,
)
from app.schemas.game.lineup_schemas import LineupRead
from app.schemas.game.pane_trim_schemas import TRIMMABLE_PANES, TrimmablePane
from app.services.game.lineup_service import _build_admin_read
from app.services.ingestion.chapter_parser import Chapter, parse_chapters
from app.services.ingestion.clip_generator import pending_clip_source_key
from app.services.ingestion.landing_clip_generator import (
    pending_landing_clip_source_key,
)
from app.services.ingestion.wide_source import cut_and_upload_wide_source
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    YouTubeFetchError,
    download_video,
    fetch_video_detail,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _validate_pane(pane: str) -> TrimmablePane:
    """Reject panes outside the trim/widen allow-list with a 400.

    Same shape + same allow-list as :func:`pane_trim_service._validate_pane`
    — widen-source and trim are sibling operations on the same panes, so the
    allow-list is shared.
    """
    if pane not in TRIMMABLE_PANES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"pane '{pane}' cannot be widened (only "
                f"{sorted(TRIMMABLE_PANES)} have a wider trim source today)"
            ),
        )
    return pane  # type: ignore[return-value]


def _find_chapter(
    chapters: list[Chapter], start_seconds: int | None,
) -> Chapter | None:
    """The chapter whose start matches the lineup's stored chapter start.

    Identical helper to the backfills' (`clip_backfill._find_chapter`) —
    exact-start match re-identifies the chapter from the same
    ``parse_chapters`` output the ingest path persisted. A miss means the
    video's chapters changed since ingest.
    """
    if start_seconds is None:
        return None
    for ch in chapters:
        if ch.start_seconds == start_seconds:
            return ch
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def widen_pane_source(
    db: AsyncSession,
    lineup: Lineup,
    pane: str,
) -> LineupRead:
    """Re-cut a wider trim-editor source for *pane* on *lineup* and persist.

    Caller (route handler) is responsible for resolving ``lineup`` from the
    path parameter first so a 404 surfaces cleanly without us duplicating
    the lookup.

    Each step has its own structured failure mode (400/404 for
    operator-correctable issues, 502 for yt-dlp, 500 for ffmpeg/MinIO/DB) —
    never a silent fail-through.
    """
    trimmable_pane = _validate_pane(pane)

    video_id = lineup.youtube_video_id
    if not video_id:
        raise HTTPException(
            status_code=404,
            detail=(
                "pane has no YouTube source to widen — manual uploads cannot "
                "be widened. Use the Replace flow to upload a wider clip "
                "instead."
            ),
        )
    if lineup.chapter_start_seconds is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "pane has a YouTube id but no chapter start recorded — "
                "ingest metadata is incomplete; cannot widen"
            ),
        )

    # ---- One metadata fetch + one download for this row ------------------
    try:
        meta = await fetch_video_detail(video_id)
    except YouTubeFetchError as exc:
        logger.warning(
            "widen-source: metadata fetch failed: lineup=%s video_id=%s "
            "error_type=%s message=%s",
            lineup.id, video_id, exc.error_type, str(exc),
        )
        raise HTTPException(
            status_code=502,
            detail=(
                f"could not fetch YouTube metadata for source video "
                f"({exc.error_type}); try again later"
            ),
        ) from exc

    chapters = parse_chapters(
        description=meta.description,
        video_duration=meta.duration,
        native_chapters=meta.chapters or None,
    )
    chapter = _find_chapter(chapters, lineup.chapter_start_seconds)
    if chapter is None:
        # The video's chapters have shifted since this lineup was ingested.
        # Same skip-reason the bulk backfill records — the operator's
        # recourse is to re-ingest or accept that the source has drifted.
        raise HTTPException(
            status_code=404,
            detail=(
                f"chapter starting at {lineup.chapter_start_seconds}s no "
                "longer exists in the source video (chapters changed since "
                "ingest); cannot re-cut a wider source"
            ),
        )

    download_dir = Path(settings.ingestion_download_dir)
    try:
        video_path = await download_video(video_id, download_dir)
    except VideoDownloadError as exc:
        logger.warning(
            "widen-source: download failed: lineup=%s video_id=%s "
            "error_type=%s message=%s",
            lineup.id, video_id, exc.error_type, str(exc),
        )
        raise HTTPException(
            status_code=502,
            detail=(
                f"could not download source video ({exc.error_type}); "
                "try again later"
            ),
        ) from exc

    try:
        # ---- Pane dispatch (source key + repo setter) ------------------
        if trimmable_pane == "throw":
            source_key = pending_clip_source_key(
                video_id, chapter.start_seconds,
            )
            persist = set_clip_url_original
        else:  # "landing" — exhaustive per _validate_pane
            source_key = pending_landing_clip_source_key(
                video_id, chapter.start_seconds,
            )
            persist = set_landing_clip_url_original

        # ---- Cut + upload via the shared helper ------------------------
        wide = await cut_and_upload_wide_source(
            local_video=video_path,
            video_id=video_id,
            chapter_start=float(chapter.start_seconds),
            chapter_end=float(chapter.end_seconds),
            source_key=source_key,
            log_prefix="widen-source-endpoint",
            lineup_id=lineup.id,
        )
        if not wide.succeeded:
            # Helper already logged the structured failure; surface as 500
            # with the captured codes so the operator sees the actionable
            # reason instead of a bare "internal error".
            raise HTTPException(
                status_code=500,
                detail=(
                    "wide source cut/upload failed: "
                    f"{','.join(wide.error_codes) or 'unknown'}"
                ),
            )

        try:
            updated = await persist(
                db, lineup, wide.source_key,  # type: ignore[arg-type]
            )
        except Exception as exc:  # noqa: BLE001 — surface any DB failure
            logger.warning(
                "widen-source: %s_url_original persist failed (object "
                "uploaded, column not committed): lineup=%s key=%s error=%s",
                trimmable_pane, lineup.id, wide.source_key, str(exc),
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    "wide source uploaded but database commit failed; "
                    "re-trying should succeed once the underlying issue is "
                    "resolved"
                ),
            ) from exc

        return _build_admin_read(updated)
    finally:
        # The endpoint owns this download — clean it up regardless of
        # success/failure so a 502/500 doesn't leak temp files.
        try:
            video_path.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning(
                "widen-source: failed to delete downloaded video: "
                "path=%s error=%s",
                video_path, str(exc),
            )
