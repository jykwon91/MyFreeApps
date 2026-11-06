"""PATCH /wow/feature-requests/triage/stories/{id}: the allowlisted edits.

Only fields present in the body are applied (``model_fields_set``). Text goes
through the same output filters as Claude's (no URLs, markup or @handles);
``shipped_path`` is the only link and must be a /wow-forever path.
"""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.wow_feature_request_limits import (
    CRITERIA_MAX_ITEMS,
    CRITERION_MAX,
    FEASIBILITY_NOTE_MAX,
    FOLLOW_UP_MAX,
    FOLLOW_UPS_MAX_ITEMS,
    I_WANT_MAX,
    OPERATOR_NOTE_MAX,
    PERSONA_MAX,
    PRIORITY_MAX,
    PRIORITY_MIN,
    SHIPPED_PATH_MAX,
    SO_THAT_MAX,
    TITLE_MAX,
    TOPIC_MAX,
)
from app.schemas.wow.feature_requests.feature_literals import Feasibility, StoryArea, TriageSettableStatus

# Fields that may be sent but never as null (their columns are NOT NULL).
NON_NULLABLE_PATCH_FIELDS: tuple[str, ...] = (
    "title",
    "persona",
    "i_want",
    "so_that",
    "acceptance_criteria",
    "follow_ups",
    "area",
    "feasibility",
    "status",
    "hidden",
)


class TriageStoryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1, max_length=TITLE_MAX)
    persona: Optional[str] = Field(default=None, min_length=1, max_length=PERSONA_MAX)
    i_want: Optional[str] = Field(default=None, min_length=1, max_length=I_WANT_MAX)
    so_that: Optional[str] = Field(default=None, min_length=1, max_length=SO_THAT_MAX)
    acceptance_criteria: Optional[list[str]] = Field(default=None, max_length=CRITERIA_MAX_ITEMS)
    follow_ups: Optional[list[str]] = Field(default=None, max_length=FOLLOW_UPS_MAX_ITEMS)
    area: Optional[StoryArea] = None
    topic: Optional[str] = Field(default=None, min_length=1, max_length=TOPIC_MAX)
    feasibility: Optional[Feasibility] = None
    feasibility_note: Optional[str] = Field(default=None, min_length=1, max_length=FEASIBILITY_NOTE_MAX)
    status: Optional[TriageSettableStatus] = None
    priority: Optional[int] = Field(default=None, ge=PRIORITY_MIN, le=PRIORITY_MAX)
    operator_note: Optional[str] = Field(default=None, min_length=1, max_length=OPERATOR_NOTE_MAX)
    shipped_path: Optional[str] = Field(
        default=None, max_length=SHIPPED_PATH_MAX, pattern=r"^/wow-forever(/[A-Za-z0-9/_\-]*)?(\?[A-Za-z0-9=&_.,:\-]*)?$"
    )
    hidden: Optional[bool] = None

    @model_validator(mode="after")
    def _no_null_for_required_columns(self) -> "TriageStoryPatch":
        for name in NON_NULLABLE_PATCH_FIELDS:
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        for name, limit in (("acceptance_criteria", CRITERION_MAX), ("follow_ups", FOLLOW_UP_MAX)):
            for item in getattr(self, name) or []:
                if not item.strip() or len(item) > limit:
                    raise ValueError(f"{name} items must be 1-{limit} characters")
        return self
