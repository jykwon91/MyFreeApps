"""The optional "About you" a visitor attaches to a feature request.

Every field is optional and allowlisted. The persona in the refined story is
built ONLY from these values, never guessed from the request text.
"""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.wow_feature_request_limits import CONTEXT_MAX_ACTIVITIES, CONTEXT_MAX_PROFESSIONS
from app.schemas.wow.feature_requests.feature_literals import (
    ContextActivity,
    ContextClass,
    ContextExperience,
    ContextFaction,
    ContextLevelBand,
    ContextProfession,
)


class FeatureRequestContext(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    class_id: Optional[ContextClass] = None
    experience: Optional[ContextExperience] = None
    level_band: Optional[ContextLevelBand] = None
    professions: list[ContextProfession] = Field(default_factory=list, max_length=CONTEXT_MAX_PROFESSIONS)
    activities: list[ContextActivity] = Field(default_factory=list, max_length=CONTEXT_MAX_ACTIVITIES)
    faction: Optional[ContextFaction] = None

    @field_validator("professions", "activities")
    @classmethod
    def _dedupe(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(values))
