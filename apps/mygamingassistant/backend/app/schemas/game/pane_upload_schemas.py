"""Schemas for the per-pane local-upload Replace flow (PR1).

The operator runs whatever editor they prefer locally (ffmpeg, DaVinci, Premiere)
and uploads the rendered small artifact directly to MinIO via a presigned PUT,
then confirms it server-side. The server never re-encodes — it just records the
new key on the right column.

Two endpoints per (lineup, pane) — request-url then confirm — mirroring the
existing /api/lineups/upload-url + POST /api/lineups manual-upload pattern:

  POST /api/lineups/{lineup_id}/panes/{pane}/upload-url
       -> PaneUploadUrlResponse {upload_url, object_key}
  POST /api/lineups/{lineup_id}/panes/{pane}/confirm
       -> LineupRead (the refreshed lineup, with the new presigned GET URL
          on the matching column)
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Pane + kind enums
# ---------------------------------------------------------------------------

Pane = Literal["stand", "aim", "throw", "landing"]
Kind = Literal["still", "clip"]

# Which (pane, kind) tuples are actually editable. STAND + AIM have both a
# still and a clip column; THROW + LANDING have only a clip column (no still
# column exists in the schema today, and adding one is out of PR1 scope).
VALID_PANE_KIND: frozenset[tuple[Pane, Kind]] = frozenset({
    ("stand", "still"), ("stand", "clip"),
    ("aim",   "still"), ("aim",   "clip"),
    ("throw", "clip"),
    ("landing", "clip"),
})

# ---------------------------------------------------------------------------
# Allowed MIME types per kind
# ---------------------------------------------------------------------------

ALLOWED_STILL_MIMES: frozenset[str] = frozenset({
    "image/png",
    "image/jpeg",
    "image/webp",
})

ALLOWED_CLIP_MIMES: frozenset[str] = frozenset({
    "video/mp4",
    "video/webm",
})

# ---------------------------------------------------------------------------
# Size limits per kind. Stills are tiny; clips can be a few seconds of muted
# H.264 — generous enough to accept slightly-oversized files but tight enough
# to refuse a full source video by mistake.
# ---------------------------------------------------------------------------

MAX_STILL_BYTES = 5 * 1024 * 1024     # 5 MB
MAX_CLIP_BYTES = 50 * 1024 * 1024     # 50 MB


def _ext_for_content_type(content_type: str) -> str:
    """Return a sensible file extension for the stored MinIO key.

    The extension is part of the key only for human inspectability; clients
    infer the type at GET time from the Content-Type response header MinIO
    records at PUT time.
    """
    mapping = {
        "image/png":  "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "video/mp4":  "mp4",
        "video/webm": "webm",
    }
    return mapping.get(content_type, "bin")


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class PaneUploadUrlRequest(BaseModel):
    """Operator declares what they're about to upload."""

    kind: Kind
    content_type: str = Field(
        ...,
        description="MIME type of the file being uploaded (e.g. image/png, video/mp4)",
    )
    content_length: int = Field(
        ...,
        ge=1,
        description="Byte size of the file being uploaded",
    )

    @field_validator("content_type")
    @classmethod
    def _content_type_lower(cls, v: str) -> str:
        return v.lower()


class PaneUploadUrlResponse(BaseModel):
    """Presigned PUT plus the deterministic MinIO key the client will upload to.

    The client must echo ``object_key`` back to the confirm endpoint so the
    server can validate the upload landed where it expected, before writing the
    key onto the lineup column.
    """

    upload_url: str
    object_key: str


class PaneConfirmRequest(BaseModel):
    """Operator confirms a completed upload at ``object_key`` for the given kind."""

    kind: Kind
    object_key: str
