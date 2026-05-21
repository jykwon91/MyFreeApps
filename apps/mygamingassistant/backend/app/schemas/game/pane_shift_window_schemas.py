"""Schemas for the per-pane STAND/AIM shift-window flow.

The STAND and AIM panes carry 1-second looping micro-clips anchored on the
classifier-chosen frame the existing stand/aim still represents. When the
classifier picks a bad anchor — common on busy frames where the player is
moving — the served clip shows the wrong moment and the whole storyboard
tile looks wrong even when the lineup itself is classified correctly.

This is the operator's way out: drag a single-thumb slider that picks where
in the SHARED wider source ``clip_url_original`` the 1-second window starts,
then save. The micro-clip width is fixed (1.0s); only the start offset is
operator-controlled — that's why this is a "shift", not a "trim".

Endpoint:

  POST /api/lineups/{lineup_id}/panes/{pane}/shift-window
       body: PaneShiftWindowRequest {offset_s}
       -> LineupRead (admin shape — re-binds slider thumb)

Only ``stand`` and ``aim`` panes are shiftable. THROW + LANDING use a
two-thumb range trim instead (``PaneTrimRequest``); their wider source
column is the same ``clip_url_original`` but the user-controlled width
is variable, not fixed.

Validation is split: pydantic enforces non-negative numeric bounds here;
the service layer enforces the upper bound against the actual wider
source's duration (which we don't know until we've probed it).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Pane allow-list — STAND + AIM only. THROW + LANDING are trimmable via
# ``PaneTrimRequest`` (variable-width range, separate endpoint).
# ---------------------------------------------------------------------------

ShiftablePane = Literal["stand", "aim"]

SHIFTABLE_PANES: frozenset[ShiftablePane] = frozenset({"stand", "aim"})


# ---------------------------------------------------------------------------
# Window-width constant — must match
# ``app.services.ingestion.micro_clip_generator._MICRO_CLIP_SECONDS``. The
# shift endpoint re-cuts the served micro-clip at this exact width starting
# from the operator's chosen offset; ingest cuts at the same width starting
# from the classifier's chosen anchor. Both paths produce 1s clips so the
# StandPane / AimPane swap between them seamlessly.
# ---------------------------------------------------------------------------

MICRO_CLIP_DURATION_S = 1.0


class PaneShiftWindowRequest(BaseModel):
    """Operator-supplied start offset for the 1-second STAND/AIM window.

    The offset is in seconds from the start of ``clip_url_original`` — the
    SHARED wider source the throw / stand / aim panes all index into (reuse
    over per-pane originals saves ~4 GB MinIO across the library). 0.0 means
    "start the 1-second window at the very beginning of the wider source";
    the upper bound (`source_duration - 1.0`) is enforced at the service
    layer once the wider source has been downloaded + probed (we don't know
    the duration here at validation time).
    """

    offset_s: float = Field(
        ...,
        ge=0.0,
        description=(
            "Seconds from the start of clip_url_original where the served "
            "1-second micro-clip should begin. Upper bound enforced "
            "server-side against the wider source's actual duration."
        ),
    )
