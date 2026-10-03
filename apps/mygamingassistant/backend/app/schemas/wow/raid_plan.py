"""The group planner's shapes: ``GET`` / ``PUT /wow/raids/{web_id}/plan`` (``app/api/raid_web.py``).

``RaidPlan`` is a leader's view of a raid's groups (``raid_plan_view``): its
seated players, as the post shows them, with where each one is and their
note while the raid takes notes.  ``RaidPlanSave`` is a save: the version it
was planned on, whether raiders see the groups, and every placed player.

Field names are snake_case like the rest of the MGA API; the frontend
mirrors them in ``FE/types/raidPlan.ts``.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.wow.wow_raid_signup import GROUP_SIZE, MAX_GROUPS
from app.schemas.wow.raid_web import DisplayRole, RaidState


class PlanPlayer(BaseModel):
    """A seated player, as the post shows them, and their place in the groups."""

    id: uuid.UUID  # the sign-up's: a save names players by it
    name: str
    wow_class: str | None = None
    spec: str | None = None  # "Fury Warrior"
    icon: str | None = None  # the spec's icon, else the class's
    role_group: DisplayRole | None = None
    number: int | None = None  # the order number in line
    late: bool = False
    note: str | None = None  # only while the raid takes notes
    group: int | None = None  # 1–8, with slot; None outside a group
    slot: int | None = None  # 1–5


class RaidPlan(BaseModel):
    """A raid's groups, as its planner shows them."""

    web_id: uuid.UUID
    title: str
    starts_at: datetime
    state: RaidState  # cancelled or completed: the planner is read-only
    size_cap: int
    group_count: int  # groups of five that hold the raid, at most eight
    version: int  # a save sends it back; someone else's save in between refuses it
    published: bool  # raiders see the groups (the page, [Groups] on the post)
    updated_at: datetime | None  # the last save
    link_expires_at: datetime
    notes_enabled: bool
    icons_version: str  # the ``?v=`` of the icon URLs
    players: list[PlanPlayer]  # in line order


class PlanAssignment(BaseModel):
    """One placed player in a save."""

    signup_id: uuid.UUID
    group: int = Field(ge=1, le=MAX_GROUPS)
    slot: int = Field(ge=1, le=GROUP_SIZE)


class RaidPlanSave(BaseModel):
    """A save: the version it was planned on, whether raiders see the groups, and every placed player."""

    version: int = Field(ge=0)
    published: bool
    assignments: list[PlanAssignment] = Field(max_length=MAX_GROUPS * GROUP_SIZE)


class RaidPlanSaved(BaseModel):
    """The groups as saved, and who was left out for having lost their seat meanwhile."""

    plan: RaidPlan
    dropped: list[str]
