"""Pydantic schemas for source-related API requests and responses."""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, field_validator


class SourceCreate(BaseModel):
    kind: str
    url: str
    # Optional classification scope. ``map_hint`` (a map slug) hard-locks every
    # lineup ingested from this source to that map — the recurrence fix for a
    # single-map source being mis-classified onto another map. ``game_hint``
    # (a game slug) is the coarser game-only scope; ``map_hint`` implies and
    # overrides it to the map's game. Slug existence is validated in
    # source_service (needs DB access); a bad slug surfaces as a 422.
    game_hint: Optional[str] = None
    map_hint: Optional[str] = None

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
    # Surfaced from config_json so the operator can see a source's classification
    # scope without parsing the raw dict.
    game_hint: Optional[str] = None
    map_hint: Optional[str] = None
    last_synced_at: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}


class SourceUpdate(BaseModel):
    """Update a source's classification scope after creation.

    Both fields optional and carry REPLACE semantics — the payload is the
    desired final scope, not a partial patch: a ``map_hint`` sets the map lock
    (and implies its game); a lone ``game_hint`` sets the coarser game scope;
    both null CLEARS the scope. Mirrors SourceCreate's hint validation
    (``map_hint`` overrides ``game_hint`` to the map's own game; an unknown
    slug surfaces as a 422 from source_service).
    """
    game_hint: Optional[str] = None
    map_hint: Optional[str] = None


class SyncJobResponse(BaseModel):
    job_id: str
    source_id: uuid.UUID
    status: str = "queued"
    message: str = "Sync started — lineups will appear in pending_review when complete"


class ReclassifySourceResult(BaseModel):
    """Outcome of re-running the classifier over a source's pending lineups.

    ``total`` is how many pending_review lineups were matched for the source;
    ``reclassified`` + ``failed`` are how many were actually processed this
    call. When ``total`` exceeds the per-call batch cap, ``reclassified +
    failed < total`` — the remainder needs another run (surfaced to the
    operator, never a silent cap).
    """
    total: int
    reclassified: int
    failed: int
