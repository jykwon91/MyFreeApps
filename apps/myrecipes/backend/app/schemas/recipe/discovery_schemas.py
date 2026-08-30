"""Schemas for recipe discovery — "find me the best version of X on the web".

Two steps, two shapes:

``DiscoveryResults``  — the browse grid. One :class:`DiscoveredRecipe` per
    candidate: enough to *choose* (title, picture, where it came from, why
    it stands out), deliberately not enough to *cook*. Cheap and wide.

``DiscoveredDetail``  — one candidate, opened. Carries a
    :class:`RecipeDraftResponse` so "Save to my recipes" hands the existing
    photo-import review editor exactly the shape it already accepts, plus
    the reading context (tips, what reviewers said) that a recipe row has no
    column for.

Nothing here is persisted. Discovery is a lookup, not a library: results
live in the HTTP response and the frontend's in-memory state until the user
saves one, at which point it becomes an ordinary recipe through the normal
``POST /recipes`` create flow.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.recipe.extraction_schemas import RecipeDraftResponse

# Where a candidate came from. Drives the badge (and the icon fallback when a
# result has no usable picture), so the frontend's union must move with this —
# see rules/feedback_enum_changes_cross_stack.
SourceType = Literal["website", "youtube", "reddit", "blog", "video", "forum"]


class DiscoveryQuery(BaseModel):
    """What the user typed, e.g. "mexican flan"."""

    query: str = Field(min_length=2, max_length=200)


class DiscoveredRecipe(BaseModel):
    """One candidate in the results grid."""

    # Stable within one result set; the frontend routes on it rather than on
    # array position, so re-sorting the grid never opens the wrong card.
    id: str
    title: str
    source_type: SourceType = "website"
    # Human-readable publisher ("Serious Eats", "r/Cooking", a channel name).
    site_name: str | None = None
    url: str
    # Proxied + signed by the backend (see discovery_image_service) — never a
    # third-party URL the browser loads directly. None when we have no usable
    # picture, which the frontend renders as a typed placeholder tile.
    image_url: str | None = None
    # One or two sentences: what this version is and who it's for.
    summary: str = ""
    # Why this one made the list — the differentiator, not a rating.
    why_notable: str | None = None
    total_minutes: int | None = None
    difficulty: Literal["easy", "medium", "hard"] | None = None


class DiscoveryResults(BaseModel):
    query: str
    recipes: list[DiscoveredRecipe] = Field(default_factory=list)


class DiscoveryDetailRequest(BaseModel):
    """Open one candidate. ``url`` is echoed back from the results grid.

    The URL is re-validated server-side before any fetch — a client can send
    anything here, so this is untrusted input, not a token of prior approval.
    """

    url: str = Field(min_length=8, max_length=2000)
    title: str = Field(default="", max_length=300)


class DiscoveredDetail(BaseModel):
    """One candidate, read in full and ready to review-and-save."""

    title: str
    source_type: SourceType = "website"
    site_name: str | None = None
    url: str
    image_url: str | None = None
    summary: str = ""
    # The editable recipe, in the same shape photo import produces.
    draft: RecipeDraftResponse = Field(default_factory=RecipeDraftResponse)
    # Reading context that has no home on a recipe row.
    tips: list[str] = Field(default_factory=list)
    # What commenters/reviewers consistently say — the reason to read Reddit
    # threads and comment sections rather than just the recipe card.
    community_notes: list[str] = Field(default_factory=list)
    # Every page consulted, so the user can go read the original.
    sources: list[str] = Field(default_factory=list)
