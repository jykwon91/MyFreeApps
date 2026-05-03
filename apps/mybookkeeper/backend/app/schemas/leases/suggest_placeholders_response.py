"""Response schema for the AI placeholder suggestion endpoint."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SuggestedPlaceholderItem(BaseModel):
    """A single AI-proposed placeholder (not yet persisted)."""

    key: str
    description: str
    input_type: str

    model_config = ConfigDict(extra="forbid")


class SuggestPlaceholdersResponse(BaseModel):
    """Response from POST /lease-templates/{id}/suggest-placeholders.

    ``suggestions`` is the proposed list for the frontend to render.
    ``truncated`` is true when the document was too large to send in full;
    ``pages_note`` carries a human-readable notice suitable for the UI.
    """

    suggestions: list[SuggestedPlaceholderItem]
    truncated: bool
    pages_note: str | None = None

    model_config = ConfigDict(extra="forbid")
