"""Pydantic schema for PATCH /vendors/{id} request body.

PATCH semantics — every field optional, only explicitly-provided fields are
applied. The repository layer applies an explicit allowlist on top of this
schema's ``extra='forbid'`` per the project rule:
"Always validate field names against an explicit allowlist before applying
dynamic updates."
"""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.vendor_enums import VENDOR_CATEGORIES

_NAME_MAX_LEN = 255
_PHONE_MAX_LEN = 50
_EMAIL_MAX_LEN = 255
_ADDRESS_MAX_LEN = 500


class VendorUpdateRequest(BaseModel):
    """Body for PATCH /vendors/{id} — every field optional."""

    name: str | None = Field(default=None, min_length=1, max_length=_NAME_MAX_LEN)
    category: str | None = None

    phone: str | None = Field(default=None, max_length=_PHONE_MAX_LEN)
    email: str | None = Field(default=None, max_length=_EMAIL_MAX_LEN)
    address: str | None = Field(default=None, max_length=_ADDRESS_MAX_LEN)

    hourly_rate: Decimal | None = Field(default=None, ge=0)
    flat_rate_notes: str | None = None

    preferred: bool | None = None
    notes: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "VendorUpdateRequest":
        if self.category is not None and self.category not in VENDOR_CATEGORIES:
            raise ValueError(
                f"category must be one of {VENDOR_CATEGORIES}, got {self.category!r}",
            )
        return self

    def to_update_dict(self) -> dict[str, object]:
        """Return only the explicitly-provided fields (Pydantic ``exclude_unset``).

        Used by the service layer to pass to ``vendor_repo.update`` — the
        repo layer applies the allowlist filter.
        """
        return self.model_dump(exclude_unset=True)
