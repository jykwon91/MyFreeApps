"""Pydantic schema for POST /applications/{id}/transitions request body.

The kanban dashboard fires this request on every drag-drop. The body
carries only the coarse-grained target column and an optional client-
generated idempotency key. ``occurred_at`` is server-clock only — the
service deliberately never trusts a client-supplied timestamp on a
transition.

``target_column`` is constrained via ``Literal`` so FastAPI rejects
unknown values at the schema layer with HTTP 422.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# Mirrors ``KanbanColumn.ALL`` in ``app.core.enums``. Kept as a Literal
# instead of an ``in`` check so the OpenAPI surface advertises the
# allowed values for documentation generators.
KanbanTargetColumn = Literal["applied", "interviewing", "offer", "closed"]


_IDEMPOTENCY_KEY_MAX_LEN = 64


class ApplicationTransitionRequest(BaseModel):
    """Body for POST /applications/{application_id}/transitions."""

    target_column: KanbanTargetColumn

    # Optional client-side UUID. When present, two POSTs with the same
    # key inside the service-level window resolve to the same event.
    idempotency_key: str | None = Field(
        default=None,
        max_length=_IDEMPOTENCY_KEY_MAX_LEN,
    )

    model_config = ConfigDict(extra="forbid")
