"""Pydantic schemas for lineup-related API requests and responses.

Two creation paths exist:
  1. Manual upload (POST /api/lineups): caller provides all classification
     fields. Status is set to 'accepted'. Fields are required.
  2. Ingestion path (internal, called by ingestion_orchestrator): creates
     with status='pending_review'; classification fields are nullable.
     Use LineupIngestCreate for this path.
"""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from app.services.game.polygon import polygon_centroid


# ---------------------------------------------------------------------------
# Nested read models
# ---------------------------------------------------------------------------

class ZoneRead(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    polygon_points: list[dict]

    model_config = {"from_attributes": True}


class UtilityTypeRead(BaseModel):
    id: uuid.UUID
    slug: str
    name: str

    model_config = {"from_attributes": True}


def _has_polygon(zone: Optional["ZoneRead"]) -> bool:
    """True when *zone* exists and carries a non-empty polygon.

    An empty ``polygon_points`` ([]) means the zone was seeded from a fixture
    but never calibrated (no operator-drawn polygon, no shipped geometry).
    In that state there is no real centroid — callers must treat the pin
    position as unknown rather than invent the map centre.
    """
    return zone is not None and bool(zone.polygon_points)


# ---------------------------------------------------------------------------
# Lineup read
# ---------------------------------------------------------------------------

class LineupRead(BaseModel):
    id: uuid.UUID
    # game_id / map_id are NULL on pending_review lineups — populated only
    # when the operator accepts (CHECK enforces non-null at status='accepted').
    # The review queue serializes pre-accept rows, so these must be optional.
    game_id: Optional[uuid.UUID] = None
    map_id: Optional[uuid.UUID] = None
    # Classification fields — nullable for pending_review lineups
    target_zone_id: Optional[uuid.UUID] = None
    stand_zone_id: Optional[uuid.UUID] = None
    side: Optional[str] = None
    utility_type_id: Optional[uuid.UUID] = None
    title: str
    notes: Optional[str] = None
    stand_screenshot_url: Optional[str] = None
    aim_screenshot_url: Optional[str] = None
    aim_anchor_x: Optional[float] = None
    aim_anchor_y: Optional[float] = None
    # Minimap anchor positions — raw values from the DB. May be NULL; use the
    # computed effective_* fields below to render pins (they fall back to the
    # zone polygon centroid when the explicit anchor isn't set).
    stand_anchor_x: Optional[float] = None
    stand_anchor_y: Optional[float] = None
    target_anchor_x: Optional[float] = None
    target_anchor_y: Optional[float] = None
    setup_seconds: Optional[int] = None
    attribution_url: Optional[str] = None
    attribution_author: Optional[str] = None
    status: str
    # YouTube ingestion metadata
    youtube_video_id: Optional[str] = None
    chapter_start_seconds: Optional[int] = None
    chapter_title: Optional[str] = None

    # Classifier suggestions (PR 5) — set by auto-classification, edited/accepted
    # by the operator in the review queue.
    suggested_game_id: Optional[uuid.UUID] = None
    suggested_map_id: Optional[uuid.UUID] = None
    suggested_target_zone_id: Optional[uuid.UUID] = None
    suggested_stand_zone_id: Optional[uuid.UUID] = None
    suggested_side: Optional[str] = None
    suggested_utility_type_id: Optional[uuid.UUID] = None
    classification_confidence: Optional[float] = None
    classification_reasoning: Optional[str] = None

    # Expanded relations (populated when available)
    target_zone: Optional[ZoneRead] = None
    stand_zone: Optional[ZoneRead] = None
    utility_type: Optional[UtilityTypeRead] = None

    model_config = {"from_attributes": True}

    @computed_field  # type: ignore[misc]
    @property
    def effective_stand_x(self) -> Optional[float]:
        """Minimap x for the stand pin: explicit anchor or stand_zone centroid.

        Returns None when there is neither an explicit anchor nor a zone with
        a non-empty polygon. We deliberately do NOT fall back to the
        polygon_centroid([]) → (0.5, 0.5) map-centre sentinel: a fabricated
        dead-centre coordinate is indistinguishable from a real one on the
        map, so it renders a misleading pin instead of signalling "position
        unknown — calibrate this zone / pin this lineup". The frontend skips
        null pins (see MapLineupPins).
        """
        if self.stand_anchor_x is not None:
            return self.stand_anchor_x
        if _has_polygon(self.stand_zone):
            return polygon_centroid(self.stand_zone.polygon_points)[0]
        return None

    @computed_field  # type: ignore[misc]
    @property
    def effective_stand_y(self) -> Optional[float]:
        if self.stand_anchor_y is not None:
            return self.stand_anchor_y
        if _has_polygon(self.stand_zone):
            return polygon_centroid(self.stand_zone.polygon_points)[1]
        return None

    @computed_field  # type: ignore[misc]
    @property
    def effective_target_x(self) -> Optional[float]:
        """Minimap x for the target pin: explicit anchor or target_zone centroid.

        Returns None when neither an explicit anchor nor a non-empty polygon
        is available — see ``effective_stand_x`` for the rationale.
        """
        if self.target_anchor_x is not None:
            return self.target_anchor_x
        if _has_polygon(self.target_zone):
            return polygon_centroid(self.target_zone.polygon_points)[0]
        return None

    @computed_field  # type: ignore[misc]
    @property
    def effective_target_y(self) -> Optional[float]:
        if self.target_anchor_y is not None:
            return self.target_anchor_y
        if _has_polygon(self.target_zone):
            return polygon_centroid(self.target_zone.polygon_points)[1]
        return None


# ---------------------------------------------------------------------------
# Lineup create — manual upload path
# All classification fields required; status always becomes 'accepted'.
# ---------------------------------------------------------------------------

class LineupCreate(BaseModel):
    game_id: uuid.UUID
    map_id: uuid.UUID
    target_zone_id: uuid.UUID
    stand_zone_id: uuid.UUID
    side: str
    utility_type_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=255)
    notes: Optional[str] = None
    # Object keys in MinIO (not full URLs — service generates presigned read URLs)
    stand_screenshot_key: Optional[str] = None
    aim_screenshot_key: Optional[str] = None
    aim_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    aim_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    stand_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    stand_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    target_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    target_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    setup_seconds: Optional[int] = Field(None, ge=0)
    attribution_url: Optional[str] = None
    attribution_author: Optional[str] = None

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: str) -> str:
        if v not in ("side_a", "side_b", "any"):
            raise ValueError("side must be side_a, side_b, or any")
        return v


# ---------------------------------------------------------------------------
# Lineup ingest create — ingestion pipeline path
# Classification fields optional (PR 5 classifier fills them later).
# game_id and map_id are also optional (classifier sets them in PR 5).
# ---------------------------------------------------------------------------

class LineupIngestCreate(BaseModel):
    source_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=255)
    youtube_video_id: Optional[str] = Field(None, max_length=20)
    chapter_start_seconds: Optional[int] = Field(None, ge=0)
    chapter_title: Optional[str] = Field(None, max_length=500)
    stand_screenshot_url: Optional[str] = Field(None, max_length=500)
    aim_screenshot_url: Optional[str] = Field(None, max_length=500)
    attribution_url: Optional[str] = Field(None, max_length=500)
    attribution_author: Optional[str] = Field(None, max_length=200)
    # game_id / map_id left null until classifier runs (PR 5)
    game_id: Optional[uuid.UUID] = None
    map_id: Optional[uuid.UUID] = None


# ---------------------------------------------------------------------------
# Lineup patch
# ---------------------------------------------------------------------------

class LineupPatch(BaseModel):
    target_zone_id: Optional[uuid.UUID] = None
    stand_zone_id: Optional[uuid.UUID] = None
    side: Optional[str] = None
    utility_type_id: Optional[uuid.UUID] = None
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    notes: Optional[str] = None
    aim_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    aim_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    stand_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    stand_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    target_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    target_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    setup_seconds: Optional[int] = Field(None, ge=0)
    attribution_url: Optional[str] = None
    attribution_author: Optional[str] = None

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("side_a", "side_b", "any"):
            raise ValueError("side must be side_a, side_b, or any")
        return v


# ---------------------------------------------------------------------------
# Upload URL response
# ---------------------------------------------------------------------------

class UploadUrlResponse(BaseModel):
    lineup_id: uuid.UUID
    stand_upload_url: str
    aim_upload_url: str
    stand_object_key: str
    aim_object_key: str


# ---------------------------------------------------------------------------
# Review queue schemas (PR 5)
# ---------------------------------------------------------------------------

class LineupAcceptBody(BaseModel):
    """Optional overrides when accepting a pending lineup.

    All fields optional — omit to accept the current suggested values as-is.
    The accepted lineup must satisfy the CHECK constraint (all four classification
    fields non-null after merging suggestions + overrides).
    """
    game_id: Optional[uuid.UUID] = None
    map_id: Optional[uuid.UUID] = None
    target_zone_id: Optional[uuid.UUID] = None
    stand_zone_id: Optional[uuid.UUID] = None
    side: Optional[str] = None
    utility_type_id: Optional[uuid.UUID] = None
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    notes: Optional[str] = None
    aim_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    aim_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    stand_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    stand_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    target_anchor_x: Optional[float] = Field(None, ge=0.0, le=1.0)
    target_anchor_y: Optional[float] = Field(None, ge=0.0, le=1.0)
    setup_seconds: Optional[int] = Field(None, ge=0)

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("side_a", "side_b", "any"):
            raise ValueError("side must be side_a, side_b, or any")
        return v


class BulkAcceptBody(BaseModel):
    """Accept multiple pending lineups in one call."""
    lineup_ids: list[uuid.UUID] = Field(..., min_length=1)
    # Per-lineup overrides keyed by lineup_id string.
    patches: dict[str, LineupAcceptBody] = Field(default_factory=dict)


class BulkAcceptSkip(BaseModel):
    """One lineup bulk-accept could not accept, with the reason why.

    ``reason`` is operator-facing: it carries the same message the single
    ``POST /lineups/{id}/accept`` endpoint returns as its 422 detail (e.g.
    "Cannot accept lineup: missing required fields: utility_type_id ..."), so
    the operator can fix the lineup instead of staring at a bare "Accepted 0".
    """
    lineup_id: uuid.UUID
    reason: str


class BulkAcceptResult(BaseModel):
    """Outcome of POST /lineups/bulk-accept.

    ``accepted`` carries the lineups that transitioned to 'accepted'.
    ``skipped`` carries the ones that could not be accepted, each with a
    human-readable reason. Skips never abort the batch — a missing-field
    lineup in the selection does not block the valid ones from accepting.
    """
    accepted: list[LineupRead]
    skipped: list[BulkAcceptSkip]


class ClassifyResponse(BaseModel):
    """Returned by POST /lineups/{id}/classify — the new suggested values."""
    lineup_id: uuid.UUID
    success: bool
    suggested_game_id: Optional[uuid.UUID] = None
    suggested_map_id: Optional[uuid.UUID] = None
    suggested_target_zone_id: Optional[uuid.UUID] = None
    suggested_stand_zone_id: Optional[uuid.UUID] = None
    suggested_side: Optional[str] = None
    suggested_utility_type_id: Optional[uuid.UUID] = None
    aim_anchor_x: Optional[float] = None
    aim_anchor_y: Optional[float] = None
    confidence: Optional[float] = None
    reasoning: str = ""
    error_codes: list[str] = Field(default_factory=list)


class PendingLineupsResponse(BaseModel):
    items: list[LineupRead]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# Source schemas
# ---------------------------------------------------------------------------

class SourceCreate(BaseModel):
    kind: str
    url: str

    @field_validator("kind")
    @classmethod
    def validate_kind(cls, v: str) -> str:
        if v not in ("youtube_playlist", "youtube_channel"):
            raise ValueError("kind must be youtube_playlist or youtube_channel")
        return v


class SourceRead(BaseModel):
    id: uuid.UUID
    kind: str
    config_json: dict
    last_synced_at: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}


class SyncJobResponse(BaseModel):
    job_id: str
    source_id: uuid.UUID
    status: str = "queued"
    message: str = "Sync started — lineups will appear in pending_review when complete"
