"""Pydantic schemas for the version diff — what changed between two versions.

These value objects form one cohesive response shape (the diff), so they live
together in one module.
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class IngredientSnapshot(BaseModel):
    """The state of one ingredient on one side of a diff."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    quantity: float | None = None
    unit: str | None = None
    note: str | None = None


class IngredientChange(BaseModel):
    """One ingredient-level difference between two versions, keyed by lineage."""

    model_config = ConfigDict(from_attributes=True)

    lineage_key: uuid.UUID
    change: str  # 'added' | 'removed' | 'changed'
    before: IngredientSnapshot | None = None
    after: IngredientSnapshot | None = None


class StepChange(BaseModel):
    """One step-level difference, matched by 1-based position."""

    model_config = ConfigDict(from_attributes=True)

    position: int
    change: str  # 'added' | 'removed' | 'changed'
    before: str | None = None
    after: str | None = None


class DiffResponse(BaseModel):
    """The full diff from one version to another (default: parent → this)."""

    model_config = ConfigDict(from_attributes=True)

    from_version_id: uuid.UUID | None = None
    from_version_number: int | None = None
    to_version_id: uuid.UUID
    to_version_number: int
    ingredient_changes: list[IngredientChange] = []
    step_changes: list[StepChange] = []
