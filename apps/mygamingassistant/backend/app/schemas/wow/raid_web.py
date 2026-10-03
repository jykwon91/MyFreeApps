"""The raid web page's read shape: ``GET /wow/raids/{web_id}`` (``app/api/raid_web.py``).

Built by ``raid_web_view.build_page`` from the same helpers as the raid's
Discord post, so the two can't disagree.  It carries only what the post
shows: names, classes and specs, order numbers, statuses and the
description, and the leader's groups while they share them.  It never carries a Discord user id, a sign-up note, the
leader's image link, a role id, or the id of who made or leads the raid
(``test_wow_raid_web_view``).

Field names are snake_case like the rest of the MGA API; the frontend
mirrors them in ``FE/types/raid.ts``.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

RaidState = Literal["open", "closed", "started", "completed", "cancelled"]
TimeStyle = Literal["t", "T", "d", "D", "f", "F", "R"]
DisplayRole = Literal["tank", "healer", "melee", "ranged"]
ListStatus = Literal["tentative", "bench", "absence"]


class TextSegment(BaseModel):
    """Plain text from the description, shown as typed (markdown included)."""

    kind: Literal["text"] = "text"
    text: str


class MentionSegment(BaseModel):
    """A mention without its id: "@member", "@role" or "#channel"."""

    kind: Literal["mention"] = "mention"
    text: str


class TimeSegment(BaseModel):
    """A Discord timestamp (``<t:unix:style>``), shown in the viewer's own zone."""

    kind: Literal["time"] = "time"
    unix: int
    style: TimeStyle


Segment = Annotated[Union[TextSegment, MentionSegment, TimeSegment], Field(discriminator="kind")]


class RaidRoleCount(BaseModel):
    """One role on the role row: its seat holders, or its players in line against a limit."""

    role: DisplayRole
    label: str
    icon: str
    count: int
    limit: int | None


class RaidEntry(BaseModel):
    """A player on the page, in a column or a list."""

    id: uuid.UUID  # the sign-up's, so the page keeps its rows across refreshes
    number: int | None = None  # the order number in line; None off the line
    name: str
    wow_class: str | None = None
    spec: str | None = None  # "Fury Warrior"
    icon: str | None = None  # the spec's icon, else the class's
    role_group: DisplayRole | None = None
    late: bool = False
    queued: bool = False


class RaidColumn(BaseModel):
    """A column with anyone in it: Tanks, a class, or "No class yet"; players in line order."""

    key: str
    label: str
    icon: str | None
    count: int
    limit: int | None
    entries: list[RaidEntry]


class RaidStatusList(BaseModel):
    """Tentative, Bench or Absence, when anyone is on it."""

    status: ListStatus
    label: str
    icon: str
    entries: list[RaidEntry]


class RaidGroup(BaseModel):
    """A planned group with anyone in it: its number and its players in slot order."""

    number: int
    entries: list[RaidEntry]  # no order numbers


class RaidGroups(BaseModel):
    """The leader's groups, while they share them (``raid_groups.groups_view``)."""

    groups: list[RaidGroup]  # each group with anyone in it, in order
    unplaced: int  # seated players in no group yet
    updated_at: datetime | None  # the last save


class RaidPage(BaseModel):
    """A posted raid, as its web page shows it."""

    web_id: uuid.UUID
    title: str
    raid_key: str
    raid_name: str
    leader_name: str | None
    starts_at: datetime
    closes_at: datetime | None  # when the deadline will close sign-ups, while they're open
    state: RaidState
    cancel_reason: str | None
    size_cap: int
    seats_taken: int  # confirmed + late, as on the post
    late: int
    queued: int
    color: str  # "#rrggbb", the post's
    banner_url: str | None  # the raid's built-in art on this site; never the leader's link
    discord_url: str | None  # the post in Discord, while there is one
    description: list[Segment]
    roles: list[RaidRoleCount]
    columns: list[RaidColumn]
    lists: list[RaidStatusList]
    groups: RaidGroups | None  # the leader's groups while they share them, else None
    icons_version: str  # the ``?v=`` of the icon URLs
