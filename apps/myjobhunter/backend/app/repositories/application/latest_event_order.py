"""The one ordering that decides which of an application's events is latest.

Two events can share an ``occurred_at`` (a kanban move and its note, an
import), so the later-written one wins, then the higher id, and the same
event is chosen on every read. The applications list, the kanban board, the
detail timeline, the events list and the stage-transition check all order by
this, so every surface agrees on an application's current stage.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import UnaryExpression

from app.models.application.application_event import ApplicationEvent

LATEST_EVENT_ORDER: tuple[UnaryExpression[Any], ...] = (
    ApplicationEvent.occurred_at.desc(),
    ApplicationEvent.created_at.desc(),
    ApplicationEvent.id.desc(),
)
