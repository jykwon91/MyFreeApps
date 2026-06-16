"""Pydantic schemas for recipe versions, ingredients, and steps.

Grouped by the version concern (inputs + responses) for cohesion. Request
models set ``extra='forbid'`` to reject mass-assignment (e.g. a smuggled
``user_id``); response models set ``from_attributes`` so they can be built
from ORM rows.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class IngredientInput(BaseModel):
    """An ingredient line submitted when creating a recipe or a tweak.

    ``lineage_key`` is optional: carry it over from a base version's ingredient
    so the diff engine tracks "same ingredient, changed"; omit it for a brand
    new ingredient and the backend assigns a fresh key.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    quantity: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=50)
    note: str | None = Field(default=None, max_length=255)
    lineage_key: uuid.UUID | None = None


class StepInput(BaseModel):
    """A single instruction submitted when creating a recipe or a tweak.

    Order is implied by position in the list.
    """

    model_config = ConfigDict(extra="forbid")

    instruction: str = Field(min_length=1, max_length=5000)


class VersionCreateRequest(BaseModel):
    """Body for POST /recipes/{id}/versions — a tweak that creates a new version."""

    model_config = ConfigDict(extra="forbid")

    base_version_id: uuid.UUID | None = Field(
        default=None,
        description="Version this tweak started from. Defaults to the latest version.",
    )
    change_note: str | None = Field(default=None, max_length=2000)
    servings: str | None = Field(default=None, max_length=50)
    prep_minutes: int | None = Field(default=None, ge=0)
    cook_minutes: int | None = Field(default=None, ge=0)
    ingredients: list[IngredientInput] = Field(default_factory=list)
    steps: list[StepInput] = Field(default_factory=list)


class IngredientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lineage_key: uuid.UUID
    position: int
    name: str
    quantity: float | None = None
    unit: str | None = None
    note: str | None = None


class StepResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int
    instruction: str


class VersionResponse(BaseModel):
    """Full version: metadata + the snapshot of ingredients and steps."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    recipe_id: uuid.UUID
    version_number: int
    parent_version_id: uuid.UUID | None = None
    change_note: str | None = None
    servings: str | None = None
    prep_minutes: int | None = None
    cook_minutes: int | None = None
    created_at: datetime
    ingredients: list[IngredientResponse] = Field(default_factory=list)
    steps: list[StepResponse] = Field(default_factory=list)


class VersionSummary(BaseModel):
    """Timeline entry — lightweight, no ingredient/step bodies."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_number: int
    change_note: str | None = None
    created_at: datetime
    cook_count: int = 0
    best_rating: int | None = None
