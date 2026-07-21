"""Pydantic schema for PATCH .../{manual_id}/places/{place_id}.

Allows name/cuisine editing, price_tier/note/map_url editing (including
clearing to null), and reordering (display_order).
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.welcome_manual_constants import (
    PLACE_CUISINE_MAX_LEN,
    PLACE_MAP_URL_MAX_LEN,
    PLACE_NAME_MAX_LEN,
    PLACE_NOTE_MAX_LEN,
    WELCOME_MANUAL_PRICE_TIERS,
)


class WelcomeManualPlaceUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=PLACE_NAME_MAX_LEN)
    cuisine: str | None = Field(default=None, min_length=1, max_length=PLACE_CUISINE_MAX_LEN)
    price_tier: str | None = Field(default=None)
    note: str | None = Field(default=None, max_length=PLACE_NOTE_MAX_LEN)
    map_url: str | None = Field(default=None, max_length=PLACE_MAP_URL_MAX_LEN)
    display_order: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(extra="forbid")

    @field_validator("price_tier")
    @classmethod
    def price_tier_must_be_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in WELCOME_MANUAL_PRICE_TIERS:
            raise ValueError(f"price_tier must be one of {WELCOME_MANUAL_PRICE_TIERS}")
        return v

    @field_validator("map_url")
    @classmethod
    def map_url_must_be_http(cls, v: str | None) -> str | None:
        if v is not None and not v.startswith(("http://", "https://")):
            raise ValueError("map_url must be an http(s) URL")
        return v

    def to_update_dict(self) -> dict[str, object]:
        """Return only explicitly-provided fields. An explicit ``null`` name,
        cuisine, or display_order is a no-op (all NOT NULL columns); an explicit
        ``null`` price_tier, note, or map_url clears it."""
        data = self.model_dump(exclude_unset=True)
        for required in ("name", "cuisine", "display_order"):
            if required in data and data[required] is None:
                data.pop(required)
        return data
