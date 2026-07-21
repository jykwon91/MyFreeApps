"""Pydantic schema for POST .../{manual_id}/places request body."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.welcome_manual_constants import (
    PLACE_CUISINE_MAX_LEN,
    PLACE_MAP_URL_MAX_LEN,
    PLACE_NAME_MAX_LEN,
    PLACE_NOTE_MAX_LEN,
    WELCOME_MANUAL_PRICE_TIERS,
)


class WelcomeManualPlaceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=PLACE_NAME_MAX_LEN)
    cuisine: str = Field(min_length=1, max_length=PLACE_CUISINE_MAX_LEN)
    price_tier: str | None = Field(default=None)
    note: str | None = Field(default=None, max_length=PLACE_NOTE_MAX_LEN)
    map_url: str | None = Field(default=None, max_length=PLACE_MAP_URL_MAX_LEN)

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
