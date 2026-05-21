"""Schemas for the per-pane clip-duration trim flow (PR2).

PR1 shipped per-pane local-upload Replace via two endpoints (request-url +
confirm). PR2 adds a third endpoint per (lineup, pane) that lets the operator
trim the *existing* clip without leaving the glance board:

  POST /api/lineups/{lineup_id}/panes/{pane}/trim
       body: PaneTrimRequest {start_offset_s, end_offset_s}
       -> LineupRead (the refreshed lineup with the new trimmed clip key)

The server downloads the existing MinIO clip, cuts a [start_offset_s,
end_offset_s] segment via the same ``cut_clip`` helper the ingestion pipeline
uses, uploads the result under the ``edits/<lineup_id>/`` prefix, and writes
the new key onto the matching column. The original clip object is left in
place as a forensic copy — same shape as PR1's per-upload uuid suffix.

Only ``throw`` and ``landing`` panes are trimmable today. STAND + AIM have
1-second micro-clips (PR6) that don't merit trimming. The pane-level guard is
the same shape as PR1's ``VALID_PANE_KIND`` — explicit allow-list rather than
"every clip-bearing pane", so adding a future pane requires opting in here.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

# ---------------------------------------------------------------------------
# Pane allow-list — THROW + LANDING only. STAND + AIM micro-clips are out of
# scope per PR2 design (1-second clips don't merit a trim UX).
# ---------------------------------------------------------------------------

TrimmablePane = Literal["throw", "landing"]

TRIMMABLE_PANES: frozenset[TrimmablePane] = frozenset({"throw", "landing"})


# ---------------------------------------------------------------------------
# Duration limits. Floor protects against pathologically-short clips that
# would render as a flicker; ceiling caps server-side ffmpeg work so a single
# trim never blocks the worker thread for minutes on an oversized request.
# ---------------------------------------------------------------------------

MIN_TRIM_DURATION_S = 1.0
MAX_TRIM_DURATION_S = 30.0


class PaneTrimRequest(BaseModel):
    """Operator-supplied trim window over the existing clip.

    Both offsets are seconds from the start of the existing clip (NOT from
    the source video). The slider in the browser drives these values; the
    server re-encodes a [start, end] segment and writes the new key onto the
    matching column.

    Validation is split: pydantic enforces non-negative + numeric bounds
    here; the service layer enforces ``start < end`` and duration limits
    against the actual clip length once it's been downloaded.
    """

    start_offset_s: float = Field(
        ...,
        ge=0.0,
        description="Seconds from the start of the existing clip to begin the trim.",
    )
    end_offset_s: float = Field(
        ...,
        gt=0.0,
        description="Seconds from the start of the existing clip to end the trim.",
    )

    @model_validator(mode="after")
    def _check_order_and_duration(self) -> "PaneTrimRequest":
        if self.end_offset_s <= self.start_offset_s:
            raise ValueError(
                f"end_offset_s ({self.end_offset_s}) must be greater than "
                f"start_offset_s ({self.start_offset_s})"
            )
        duration = self.end_offset_s - self.start_offset_s
        if duration < MIN_TRIM_DURATION_S:
            raise ValueError(
                f"trim duration {duration:.3f}s is below the {MIN_TRIM_DURATION_S}s "
                "minimum"
            )
        if duration > MAX_TRIM_DURATION_S:
            raise ValueError(
                f"trim duration {duration:.3f}s exceeds the {MAX_TRIM_DURATION_S}s "
                "maximum"
            )
        return self
