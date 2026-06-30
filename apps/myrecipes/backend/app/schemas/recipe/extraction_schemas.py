"""Schema for an AI-extracted recipe *draft* (photo import).

This is the response shape of ``POST /recipes/extract``. It deliberately
mirrors the field shape of :class:`RecipeCreateRequest` so the frontend can
drop the draft straight into the editor — but it is intentionally **lenient**
where the create request is strict:

- ``title`` may be ``""`` (the create request requires ``min_length=1``); an
  empty title just means "we couldn't read one — you fill it in".
- ingredient ``name`` and step ``instruction`` carry no ``min_length`` here;
  the extraction service drops blank rows before building this model, and the
  real constraints are enforced at save time by ``RecipeCreateRequest``.

Nothing here is persisted — the draft lives only in the HTTP response and the
frontend's in-memory editor state until the user reviews and saves.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class DraftIngredient(BaseModel):
    name: str = ""
    quantity: float | None = None
    unit: str | None = None
    note: str | None = None


class DraftStep(BaseModel):
    instruction: str = ""


class RecipeDraftResponse(BaseModel):
    """A best-effort recipe extracted from a photo, for review-then-save."""

    title: str = ""
    description: str | None = None
    source: str | None = None
    servings: str | None = None
    prep_minutes: int | None = None
    cook_minutes: int | None = None
    ingredients: list[DraftIngredient] = Field(default_factory=list)
    steps: list[DraftStep] = Field(default_factory=list)
