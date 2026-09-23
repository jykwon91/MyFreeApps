"""World Map capture schemas — the addon's records after the browser has
parsed and classified the SavedVariables file, and the public read shape.

Field names are snake_case like the rest of the MGA API. Allowed ``kind`` /
``subkind`` / ``faction`` values come from the model's CHECK constraints.
"""
from datetime import datetime
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.wow.map_capture import (
    INSTANCE_SUBKINDS,
    QUEST_GIVER_SUBKINDS,
    SERVICE_SUBKINDS,
)

# One SavedVariables file holds a few hundred records after a long session;
# the cap only stops a runaway payload.
MAX_CAPTURES_PER_IMPORT = 5000
MAX_QUESTS_PER_GIVER = 50

CaptureKind = Literal["service", "quest_giver", "instance"]
CaptureFaction = Literal["A", "H", "N"]
Coordinate = Annotated[float, Field(ge=0, le=100)]
Level = Annotated[int, Field(ge=1, le=100)]

_SUBKINDS_BY_KIND: dict[str, tuple[str, ...]] = {
    "service": SERVICE_SUBKINDS,
    "quest_giver": QUEST_GIVER_SUBKINDS,
    "instance": INSTANCE_SUBKINDS,
}


class CapturedQuest(BaseModel):
    """A quest the giver offered when it was captured."""

    model_config = ConfigDict(extra="forbid")

    id: Optional[int] = Field(default=None, ge=1)
    title: str = Field(min_length=1, max_length=200)
    level: Level
    # The capturing character's level if lower than ``level`` — the quest was
    # offered, so it opens at or below that level.
    min_level: Level


class MapCaptureWrite(BaseModel):
    """One capture, as imported by the operator and stored in the pack."""

    model_config = ConfigDict(extra="forbid")

    capture_key: str = Field(min_length=1, max_length=200)
    kind: CaptureKind
    subkind: str = Field(min_length=1, max_length=40)
    tag: str = Field(default="", max_length=40)
    npc_id: Optional[int] = Field(default=None, ge=1)
    name: str = Field(min_length=1, max_length=120)
    title: str = Field(default="", max_length=120)
    zone_id: int = Field(ge=1)
    subzone: str = Field(default="", max_length=120)
    x: Coordinate
    y: Coordinate
    faction: CaptureFaction
    quests: Optional[list[CapturedQuest]] = Field(default=None, max_length=MAX_QUESTS_PER_GIVER)
    captured_at: datetime

    @model_validator(mode="after")
    def _subkind_matches_kind(self) -> "MapCaptureWrite":
        if self.subkind not in _SUBKINDS_BY_KIND[self.kind]:
            raise ValueError(f"subkind {self.subkind!r} is not a {self.kind} type")
        if self.quests is not None and self.kind != "quest_giver":
            raise ValueError("only quest givers list quests")
        return self


class MapCaptureRead(MapCaptureWrite):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class MapCaptureList(BaseModel):
    captures: list[MapCaptureRead]


class MapCaptureImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    captures: list[MapCaptureWrite] = Field(min_length=1, max_length=MAX_CAPTURES_PER_IMPORT)


class MapCaptureImportResult(BaseModel):
    created: int
    updated: int
    # Already stored with the same or a newer capture time.
    unchanged: int
