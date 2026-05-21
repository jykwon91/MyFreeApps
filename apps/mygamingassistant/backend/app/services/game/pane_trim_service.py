"""Per-pane clip-duration trim service (PR2).

The operator drags a two-handle range slider over the existing pane clip and
hits Apply. The frontend POSTs ``{start_offset_s, end_offset_s}`` to a single
endpoint; this service:

    1. Resolves the source clip key on the matching column (``clip_url`` for
       THROW, ``landing_clip_url`` for LANDING). 404 if no clip is set.
    2. Downloads the bytes from MinIO and writes them to a temp file (ffmpeg
       wants a real file path; it cannot read MP4 from stdin reliably for
       ``-movflags +faststart``).
    3. Cuts a [start, end] segment via the existing ``cut_clip`` helper —
       same encode contract as the auto-ingest clips (libx264 crf 28
       veryfast yuv420p +faststart 720p cap muted).
    4. Uploads the resulting bytes under ``edits/<lineup_id>/`` (same prefix
       PR1 reserved for operator-driven edits) and persists the new bare key
       on the matching column via the existing per-column setter.

Errors are surfaced (never silent-fail) — ffmpeg / MinIO failures raise an
HTTPException with a meaningful detail string. ``ClipCutError`` is caught
and re-raised as a 500 with the structured ffmpeg exit context for log
correlation, per rules/check-third-party-error-codes.md.
"""
from __future__ import annotations

import asyncio
import logging
import tempfile
import uuid
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage
from app.models.game.lineup import Lineup
from app.repositories.game.lineup_repo import set_clip_url, set_landing_clip_url
from app.schemas.game.lineup_schemas import LineupRead
from app.schemas.game.pane_trim_schemas import (
    TRIMMABLE_PANES,
    PaneTrimRequest,
    TrimmablePane,
)
from app.services.game.lineup_service import _build_read
from app.services.ingestion.frame_extractor import ClipCutError, cut_clip

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pane → (source column, persistence setter) dispatch.
#
# Resolved inline in trim_pane_clip rather than via a module-level table so
# tests that patch ``pane_trim_service.set_clip_url`` actually see the
# patched binding — a frozen dataclass would capture the function object at
# module-import time and survive any later monkeypatch.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _validate_pane(pane: str) -> TrimmablePane:
    """Reject panes outside the trim allow-list with a 400."""
    if pane not in TRIMMABLE_PANES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"pane '{pane}' is not trimmable (only "
                f"{sorted(TRIMMABLE_PANES)} support trim today)"
            ),
        )
    return pane  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Key naming — trimmed clips live under the same ``edits/<lineup_id>/`` prefix
# PR1 reserved for operator-driven edits. The ``trim`` infix distinguishes
# them from operator replacements in forensic listings; the uuid suffix keeps
# every trim a distinct object so the column always points at the latest
# while older keys remain available for inspection. A cleanup job can prune
# unreferenced ``edits/`` keys later if it becomes meaningful at scale.
# ---------------------------------------------------------------------------


def _build_trim_key(lineup_id: uuid.UUID, pane: TrimmablePane) -> str:
    return f"edits/{lineup_id}/{pane}-clip-trim-{uuid.uuid4()}.mp4"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def trim_pane_clip(
    db: AsyncSession,
    lineup: Lineup,
    pane: str,
    request: PaneTrimRequest,
) -> LineupRead:
    """Trim the existing clip on ``pane`` and persist the result.

    Caller (route handler) is responsible for resolving ``lineup`` from the
    path parameter first so a 404 surfaces cleanly without us duplicating
    the lookup.

    The trim is end-to-end: download source → ffmpeg cut → upload new key
    → set column. Each step has its own structured failure mode (400/404 for
    operator-correctable issues, 500 with ffmpeg context for server-side
    failures) — never a silent-fail bool.
    """
    trimmable_pane = _validate_pane(pane)

    # Resolve source column + persistence setter for this pane.
    if trimmable_pane == "throw":
        source_key = lineup.clip_url
        persist = set_clip_url
    else:  # "landing" — exhaustive per _validate_pane
        source_key = lineup.landing_clip_url
        persist = set_landing_clip_url

    if not source_key:
        raise HTTPException(
            status_code=404,
            detail=(
                f"pane '{pane}' has no clip to trim — upload one via the "
                "Replace flow first, or wait for ingest's auto-clip pipeline"
            ),
        )

    storage = get_storage()

    # Download the source clip. MinIO get is blocking — run off the event loop.
    loop = asyncio.get_running_loop()
    try:
        source_bytes = await loop.run_in_executor(
            None, storage.download_file, source_key
        )
    except Exception as exc:  # noqa: BLE001 — surface as a 502 with context
        logger.warning(
            "pane_trim: source download failed: lineup=%s pane=%s key=%s error=%s",
            lineup.id, pane, source_key, str(exc),
        )
        raise HTTPException(
            status_code=502,
            detail=f"could not download source clip from storage: {exc}",
        ) from exc

    # Write source bytes to a temp file so ffmpeg can input-seek through it.
    # NamedTemporaryFile + delete=False lets us close the handle before
    # ffmpeg reads (Windows-safe) and unlink in a finally block.
    duration_s = request.end_offset_s - request.start_offset_s
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(source_bytes)
        source_path = Path(tmp.name)

    try:
        try:
            trimmed_bytes = await cut_clip(
                source_path,
                start_seconds=request.start_offset_s,
                duration_seconds=duration_s,
            )
        except ClipCutError as exc:
            logger.warning(
                "pane_trim: ffmpeg cut failed: lineup=%s pane=%s start=%.3f "
                "duration=%.3f returncode=%d stderr=%s",
                lineup.id, pane, exc.start, exc.duration,
                exc.returncode, exc.stderr,
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    f"ffmpeg trim failed (rc={exc.returncode}); the clip may be "
                    "shorter than the requested range or the source file is "
                    "corrupt"
                ),
            ) from exc

        # Upload trimmed bytes under the edits/ prefix. Storage put is
        # blocking — also goes off the event loop.
        new_key = _build_trim_key(lineup.id, trimmable_pane)
        try:
            await loop.run_in_executor(
                None, storage.upload_file, new_key, trimmed_bytes, "video/mp4"
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "pane_trim: upload failed: lineup=%s pane=%s key=%s error=%s",
                lineup.id, pane, new_key, str(exc),
            )
            raise HTTPException(
                status_code=502,
                detail=f"could not upload trimmed clip to storage: {exc}",
            ) from exc

        updated = await persist(db, lineup, new_key)
        return _build_read(updated)
    finally:
        # Always clean up the temp source file — even on success the bytes
        # are no longer needed (MinIO owns the canonical copy).
        source_path.unlink(missing_ok=True)
