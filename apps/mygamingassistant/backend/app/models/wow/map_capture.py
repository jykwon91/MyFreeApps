"""WowMapCapture — a World Map location recorded in WoW Forever by the MGA
Companion addon.

The World Map's base layer is Classic data (cmangos classic-db), labelled
"may differ in Forever". A capture is what the operator actually saw in the
Forever client: an NPC they targeted, a quest giver they talked to, or a
dungeon entrance they walked through. The frontend lays captures over the
Classic rows — a capture with the same NPC id (or name + zone) replaces the
Classic row's position.

Public content, like the lineup library: no user FK. Written by the operator
through the auth-only import endpoint (local full-auth mode) and published to
the serve-only production site through the committed pack
``backend/data/wow_map_captures.json`` (``python -m app.cli import-wow-captures``
on every deploy).

``kind`` / ``subkind`` values mirror the frontend's ``POI_KIND`` and
``SERVICE_KIND`` / ``QUEST_GIVER_KIND`` / ``INSTANCE_KIND`` constants
(``frontend/src/games/wow-forever/types/worldMap.ts`` and
``data/worldMap/serviceKinds.ts``) — change them together.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import CheckConstraint, DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

CAPTURE_KINDS = ("service", "quest_giver", "instance")
SERVICE_SUBKINDS = (
    "class_trainer",
    "demon_trainer",
    "pet_trainer",
    "profession_trainer",
    "weapon_master",
    "riding_trainer",
    "flight_master",
    "banker",
    "auctioneer",
    "innkeeper",
    "stable_master",
    "repair",
)
QUEST_GIVER_SUBKINDS = ("npc", "object")
INSTANCE_SUBKINDS = ("dungeon", "raid")
CAPTURE_SUBKINDS = SERVICE_SUBKINDS + QUEST_GIVER_SUBKINDS + INSTANCE_SUBKINDS
CAPTURE_FACTIONS = ("A", "H", "N")


class WowMapCapture(Base):
    __tablename__ = "wow_map_capture"
    __table_args__ = (
        CheckConstraint(f"kind IN {CAPTURE_KINDS!r}", name="ck_wowmapcapture_kind"),
        CheckConstraint(f"subkind IN {CAPTURE_SUBKINDS!r}", name="ck_wowmapcapture_subkind"),
        CheckConstraint(f"faction IN {CAPTURE_FACTIONS!r}", name="ck_wowmapcapture_faction"),
        CheckConstraint("x >= 0 AND x <= 100 AND y >= 0 AND y <= 100", name="ck_wowmapcapture_coords"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    # Stable identity from the addon ("npc:<id>:service", "object:<id>:quest",
    # "instance:<name>") — re-importing the same SavedVariables updates rows
    # instead of duplicating them.
    capture_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    subkind: Mapped[str] = mapped_column(String(40), nullable=False)
    # Narrows the subkind: class id for class trainers, profession id for
    # profession trainers. Empty otherwise.
    tag: Mapped[str] = mapped_column(String(40), nullable=False, default="", server_default="")
    # Creature / game-object entry from the unit GUID. Null for instances.
    npc_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False, default="", server_default="")
    # The client's uiMapID and map-percent coordinates (0-100) on that map.
    zone_id: Mapped[int] = mapped_column(Integer, nullable=False)
    subzone: Mapped[str] = mapped_column(String(120), nullable=False, default="", server_default="")
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    faction: Mapped[str] = mapped_column(String(1), nullable=False)
    # Quest givers: the quests offered when captured — [{id, title, level, minLevel}].
    quests: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JSONB, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
