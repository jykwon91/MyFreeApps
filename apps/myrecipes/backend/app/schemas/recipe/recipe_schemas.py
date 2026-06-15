"""Pydantic schemas for the Recipe entity (requests + list/detail responses)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.recipe.version_schemas import (
    IngredientInput,
    StepInput,
    VersionResponse,
)


class RecipeCreateRequest(BaseModel):
    """Create a recipe together with its first version (v1) in one call."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    source: str | None = Field(default=None, max_length=1000)
    servings: str | None = Field(default=None, max_length=50)
    prep_minutes: int | None = Field(default=None, ge=0)
    cook_minutes: int | None = Field(default=None, ge=0)
    ingredients: list[IngredientInput] = Field(default_factory=list)
    steps: list[StepInput] = Field(default_factory=list)


class RecipeUpdateRequest(BaseModel):
    """Patch recipe-level metadata only.

    Ingredients/steps never change in place — that's what a tweak (a new
    version) is for. This endpoint only edits the recipe's title/description/
    source.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    source: str | None = Field(default=None, max_length=1000)


class RecipeSummary(BaseModel):
    """List-view recipe: identity + rollups, no version bodies."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    description: str | None = None
    source: str | None = None
    created_at: datetime
    updated_at: datetime
    version_count: int = 0
    latest_version_number: int | None = None
    best_rating: int | None = None
    last_cooked_at: datetime | None = None


class RecipeDetailResponse(RecipeSummary):
    """Detail-view recipe: the summary plus the full latest version."""

    latest_version: VersionResponse | None = None
