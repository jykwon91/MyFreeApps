"""Per-pane STAND/AIM shift-window service.

The STAND and AIM panes show 1-second looping micro-clips anchored on the
classifier's chosen stand/aim frame. When the classifier picks badly, the
operator needs a way to nudge the 1-second window without leaving the
glance board. This service is the backend half of that flow: it re-cuts
the served micro-clip at the operator's chosen offset inside the SHARED
wider source ``clip_url_original`` (the same column the throw trim editor
reads from — micro panes reuse the chapter's wider source rather than
keeping per-pane originals; saves ~4 GB MinIO across the library).

End-to-end:

  1. Validate pane (only ``stand`` / ``aim`` — THROW/LANDING use the
     two-thumb trim path instead).
  2. Validate the wider source exists. ``clip_url_original`` MUST be set
     AND must be distinct from ``clip_url``; equality means the ingest
     widen-source step fell back to the legacy "original = served" posture
     (no wider footage available) and shifting is a no-op. Returns 409 with
     a "widen source first" message in that case.
  3. Download ``clip_url_original`` bytes from MinIO and ffprobe the
     duration. We need the actual on-disk duration (not the math from
     chapter bounds) to enforce a precise upper bound on ``offset_s``.
  4. Validate ``offset_s + 1.0 <= source_duration``. Pydantic already
     enforces ``offset_s >= 0``; the upper bound depends on the source
     bytes, so it lives here.
  5. Cut a 1.0s clip from the wider source at ``offset_s`` via the shared
     :func:`cut_clip` helper (same encode contract as ingest's micro-clip
     cut so glance-board playback stays consistent).
  6. Upload the new clip under the same deterministic
     ``pending_stand_clip_key`` / ``pending_aim_clip_key`` the ingest path
     used — overwriting in place. Re-shifts overwrite the same object, no
     orphans.
  7. Persist ``stand_clip_url`` (or ``aim_clip_url``) + ``stand_clip_offset_s``
     (or ``aim_clip_offset_s``) via the PR1 setter's two-shape contract
     (offset_s kwarg). The shift overlay opens the slider at the saved
     offset on the next visit.
  8. Return the admin-shape LineupRead so the frontend rebinds the slider
     without a separate fetch.

Failures (per rules/check-third-party-error-codes.md): structured codes are
captured + surfaced. MinIO download failure → 502; ffprobe / ffmpeg failure
→ 500 with the structured stderr context; DB commit failure → 500. Never
a silent fail-through.

Note on offset semantics: ``offset_s`` is in seconds from the start of the
WIDER source, NOT from the chapter start. The frontend converts between
the two (chapter offset + clip_source_pre_seconds) when surfacing
human-readable timestamps to the operator.
"""
from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage
from app.models.game.lineup import Lineup
from app.repositories.game.lineup_repo import (
    set_aim_clip_url,
    set_stand_clip_url,
)
from app.schemas.game.lineup_schemas import LineupRead
from app.schemas.game.pane_shift_window_schemas import (
    MICRO_CLIP_DURATION_S,
    SHIFTABLE_PANES,
    PaneShiftWindowRequest,
    ShiftablePane,
)
from app.services.game.lineup_service import _build_admin_read
from app.services.ingestion.frame_extractor import (
    ClipCutError,
    ProbeError,
    cut_clip,
    probe_duration,
)
from app.services.ingestion.micro_clip_generator import (
    pending_aim_clip_key,
    pending_stand_clip_key,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _validate_pane(pane: str) -> ShiftablePane:
    """Reject panes outside the shift allow-list with a 400.

    THROW + LANDING use the two-thumb trim path (``pane_trim_service``); only
    STAND + AIM have a single-offset shift UX because their served clip
    width is fixed at 1.0s.
    """
    if pane not in SHIFTABLE_PANES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"pane '{pane}' cannot be shifted (only "
                f"{sorted(SHIFTABLE_PANES)} have a fixed-width micro-clip "
                "today; throw/landing use the two-thumb trim endpoint instead)"
            ),
        )
    return pane  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Pane → (source key fn, persistence setter) dispatch.
# Resolved inline in shift_pane_window rather than via a module-level table
# so tests that patch ``pane_shift_window_service.set_stand_clip_url``
# actually see the patched binding (same rationale as pane_trim_service).
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def shift_pane_window(
    db: AsyncSession,
    lineup: Lineup,
    pane: str,
    request: PaneShiftWindowRequest,
) -> LineupRead:
    """Re-cut the STAND or AIM 1-second micro-clip at *request.offset_s*.

    Caller (route handler) resolves *lineup* from the path so a 404 surfaces
    cleanly without us duplicating the lookup.

    Each step has its own structured failure mode (400 for invalid pane /
    offset out of range, 409 for "widen source first", 502 for MinIO,
    500 for ffprobe/ffmpeg/DB) — never a silent fail-through.
    """
    shiftable_pane = _validate_pane(pane)

    # The shared wider source must exist AND be distinct from the served
    # clip. Equality means the throw widen-source step never ran (or fell
    # back to the legacy "original = served" posture), so there's no wider
    # footage to shift inside. 409 communicates "do the prerequisite first"
    # rather than 404 which would imply "the lineup doesn't exist".
    if (
        lineup.clip_url_original is None
        or lineup.clip_url_original == lineup.clip_url
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "no wider source for this chapter — click 'Widen source' on "
                "the throw pane first; that unlocks shifting for stand/aim "
                "too (the wider source is shared across all four panes)"
            ),
        )

    source_key = lineup.clip_url_original

    # ---- Download the wider source from MinIO --------------------------
    storage = get_storage()
    loop = asyncio.get_running_loop()
    try:
        source_bytes = await loop.run_in_executor(
            None, storage.download_file, source_key
        )
    except Exception as exc:  # noqa: BLE001 — surface as a 502 with context
        logger.warning(
            "pane_shift_window: source download failed: lineup=%s pane=%s "
            "key=%s error=%s",
            lineup.id, pane, source_key, str(exc),
        )
        raise HTTPException(
            status_code=502,
            detail=f"could not download wider source clip from storage: {exc}",
        ) from exc

    # Write to a temp file so ffprobe / ffmpeg can input-seek through it.
    # NamedTemporaryFile + delete=False lets us close the handle before
    # ffprobe + ffmpeg read (Windows-safe) and unlink in a finally block.
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(source_bytes)
        source_path = Path(tmp.name)

    try:
        # ---- Probe the actual duration ---------------------------------
        # We need the on-disk duration (not the chapter-math estimate) to
        # enforce a precise upper bound on offset_s. ffprobe is cheap
        # (~50ms) and ensures the validation matches reality even if
        # clip_source_pre/post_seconds changed since the wider source was
        # cut.
        try:
            source_duration = await probe_duration(source_path)
        except ProbeError as exc:
            logger.warning(
                "pane_shift_window: ffprobe failed: lineup=%s pane=%s "
                "returncode=%d stderr=%s",
                lineup.id, pane, exc.returncode, exc.stderr,
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    "could not probe wider source duration "
                    f"(ffprobe rc={exc.returncode}); the source file may "
                    "be corrupt"
                ),
            ) from exc

        # ---- Enforce the operator's offset is in range ------------------
        max_offset = source_duration - MICRO_CLIP_DURATION_S
        if max_offset < 0:
            # The wider source is shorter than the micro-clip width.
            # Shouldn't happen for any real wider source (chapter + pre/post
            # is always at least a few seconds) but guard against corrupt
            # state rather than feeding ffmpeg a negative duration.
            raise HTTPException(
                status_code=500,
                detail=(
                    f"wider source is too short ({source_duration:.3f}s) "
                    "to host a 1-second micro-clip — re-run widen-source"
                ),
            )
        if request.offset_s > max_offset:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"offset_s {request.offset_s:.3f}s would push the "
                    f"1-second window past the wider source "
                    f"({source_duration:.3f}s); valid range is "
                    f"[0, {max_offset:.3f}]"
                ),
            )

        # ---- Cut the new 1s micro-clip ----------------------------------
        try:
            clip_bytes = await cut_clip(
                source_path,
                start_seconds=request.offset_s,
                duration_seconds=MICRO_CLIP_DURATION_S,
            )
        except ClipCutError as exc:
            logger.warning(
                "pane_shift_window: ffmpeg cut failed: lineup=%s pane=%s "
                "offset=%.3f returncode=%d stderr=%s",
                lineup.id, pane, request.offset_s, exc.returncode, exc.stderr,
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    f"ffmpeg shift cut failed (rc={exc.returncode}); the "
                    "wider source may be corrupt"
                ),
            ) from exc

        # ---- Pane dispatch (key fn + repo setter) -----------------------
        if shiftable_pane == "stand":
            new_key = pending_stand_clip_key(
                lineup.youtube_video_id or "",
                float(lineup.chapter_start_seconds or 0),
            )
            persist = set_stand_clip_url
        else:  # "aim" — exhaustive per _validate_pane
            new_key = pending_aim_clip_key(
                lineup.youtube_video_id or "",
                float(lineup.chapter_start_seconds or 0),
            )
            persist = set_aim_clip_url

        # ---- Upload (overwrites the deterministic key) ------------------
        # The micro-clip key is one per (video, chapter start), so re-shifting
        # overwrites the same MinIO object — no orphan accumulation.
        try:
            await loop.run_in_executor(
                None, storage.upload_file, new_key, clip_bytes, "video/mp4"
            )
        except Exception as exc:  # noqa: BLE001 — surface as 502 with context
            logger.warning(
                "pane_shift_window: upload failed: lineup=%s pane=%s "
                "key=%s error=%s",
                lineup.id, pane, new_key, str(exc),
            )
            raise HTTPException(
                status_code=502,
                detail=f"could not upload shifted clip to storage: {exc}",
            ) from exc

        # ---- Persist clip_url + offset_s in one commit ------------------
        try:
            updated = await persist(
                db, lineup, new_key, offset_s=request.offset_s,
            )
        except Exception as exc:  # noqa: BLE001 — surface any DB failure
            logger.warning(
                "pane_shift_window: %s_clip_url persist failed (object "
                "uploaded, column not committed): lineup=%s key=%s error=%s",
                shiftable_pane, lineup.id, new_key, str(exc),
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    "shifted clip uploaded but database commit failed; "
                    "re-trying should succeed once the underlying issue "
                    "is resolved"
                ),
            ) from exc

        return _build_admin_read(updated)
    finally:
        # Always clean up the temp source file — even on success the bytes
        # are no longer needed (MinIO owns the canonical copy).
        source_path.unlink(missing_ok=True)
