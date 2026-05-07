"""Pydantic schema for a single row in ``GET /applications?view=kanban``.

The kanban dashboard joins ``applications`` -> ``application_events`` (for
the most-recent stage-defining event) and -> ``job_analyses`` (for the
operator's verdict on the analysis that spawned the application, if any).

Per data-design review, no denormalized ``kanban_stage`` column lives on
``applications``. The column-mapping happens in the service layer and the
frontend reads ``latest_event_type`` + a derived column id.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, ConfigDict


class ApplicationKanbanItem(BaseModel):
    """One card on the kanban board."""

    id: uuid.UUID
    role_title: str
    applied_at: _dt.datetime | None = None
    archived: bool

    company_id: uuid.UUID
    company_name: str
    company_logo_url: str | None = None

    # The most-recent stage-defining event. ``note_added``,
    # ``email_received``, and ``follow_up_sent`` are filtered out by the
    # repository — they don't define a stage. ``None`` when the
    # application has no events yet (legacy data).
    latest_event_type: str | None = None

    # When the operator entered the current stage. Drives the
    # "days in stage" badge on the card.
    stage_entered_at: _dt.datetime | None = None

    # The verdict from the JobAnalysis that spawned this application,
    # if any. ``None`` when the application was created directly.
    verdict: str | None = None

    model_config = ConfigDict(from_attributes=True)
