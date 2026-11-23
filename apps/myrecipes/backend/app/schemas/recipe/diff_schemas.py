"""Pydantic schemas for the version diff — what changed between two versions.

These value objects form one cohesive response shape (the diff), so they live
together in one module.
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict

from app.core.version_diff_fields import VersionDiffField


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
    """One step-level difference. Steps have no lineage key, so the two versions'
    steps are aligned by their text; ``position`` is the step's 1-based place in the
    new version, or in the old version for a removed step."""

    model_config = ConfigDict(from_attributes=True)

    position: int
    change: str  # 'added' | 'removed' | 'changed'
    before: str | None = None
    after: str | None = None


class FieldChange(BaseModel):
    """A change to one per-version field (servings, prep or cook minutes).

    ``before`` is None for a field that was empty (or for the first version,
    which has nothing before it); ``after`` is None for a field that was cleared.
    """

    model_config = ConfigDict(from_attributes=True)

    field: VersionDiffField
    before: str | int | None = None
    after: str | int | None = None


class DiffResponse(BaseModel):
    """The full diff from one version to another (default: parent → this)."""

    model_config = ConfigDict(from_attributes=True)

    from_version_id: uuid.UUID | None = None
    from_version_number: int | None = None
    to_version_id: uuid.UUID
    to_version_number: int
    field_changes: list[FieldChange] = []
    ingredient_changes: list[IngredientChange] = []
    step_changes: list[StepChange] = []
    # The same ingredients in another order, or a step moved. An ingredient reorder is
    # not an added, removed or changed row, so without this it would read as identical;
    # a moved step also shows as removed in one place and added in another.
    order_changed: bool = False
