"""Pydantic schemas for the resume-refinement feature."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class ImprovementTarget(BaseModel):
    """One entry in the prioritized critique list.

    Produced by the initial critique pass. The rewrite loop walks the
    list in order, generating one proposal per target.
    """

    section: str = Field(..., description="Section/bullet identifier — e.g. 'Senior SWE @ Acme — bullet 2'.")
    current_text: str = Field(..., description="Verbatim text from the source resume.")
    improvement_type: Literal[
        "add_metric",
        "add_outcome",
        "tighten_phrasing",
        "remove_jargon",
        "stronger_verb",
        "add_scope",
        "fix_grammar",
        "other",
    ] = Field(..., description="Why this section needs work.")
    severity: Literal["critical", "high", "medium", "low"] = Field(
        ..., description="Priority for the rewrite loop ordering.",
    )
    notes: str | None = Field(
        default=None,
        description="Critique pass's free-form notes about why this target matters.",
    )


class TurnRead(BaseModel):
    id: uuid.UUID
    turn_index: int
    role: str
    target_section: str | None = None
    proposed_text: str | None = None
    user_text: str | None = None
    rationale: str | None = None
    clarifying_question: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionRead(BaseModel):
    id: uuid.UUID
    source_resume_job_id: uuid.UUID | None = None
    status: str
    current_draft: str
    improvement_targets: list[ImprovementTarget] | None = None
    target_index: int
    pending_target_section: str | None = None
    pending_proposal: str | None = None
    pending_rationale: str | None = None
    pending_clarifying_question: str | None = None
    turn_count: int
    total_tokens_in: int
    total_tokens_out: int
    total_cost_usd: Decimal
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SessionWithTurnsRead(SessionRead):
    turns: list[TurnRead] = Field(default_factory=list)


class SessionStartRequest(BaseModel):
    """Start a new refinement session from a previously-uploaded resume.

    The source job must be ``status='complete'`` so we have parsed
    fields to render into the initial markdown draft.
    """

    source_resume_job_id: uuid.UUID = Field(
        ...,
        description="ID of an existing ``resume_upload_jobs`` row, status=complete.",
    )


class TurnAcceptRequest(BaseModel):
    """User accepts the pending AI proposal as-is."""

    pass


class TurnCustomRequest(BaseModel):
    """User supplies their own rewrite instead of the AI proposal."""

    user_text: str = Field(..., min_length=1, max_length=4000)


class TurnAlternativeRequest(BaseModel):
    """User asks Claude for a different proposal for the same target.

    Optional ``hint`` lets the user nudge the regenerated proposal
    (e.g. "make it more concise", "emphasize technical leadership").
    """

    hint: str | None = Field(default=None, max_length=500)


class TurnSkipRequest(BaseModel):
    """User skips the current target without modifying it."""

    pass


class SessionCompleteRequest(BaseModel):
    """User marks the session done. Locks the current_draft."""

    pass


class NavigateRequest(BaseModel):
    """Move the iteration cursor without acting on the current proposal."""

    direction: Literal["next", "prev"] = Field(
        ...,
        description="Move to the next or previous improvement target.",
    )
