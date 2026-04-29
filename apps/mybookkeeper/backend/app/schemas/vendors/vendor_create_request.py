"""Pydantic schema for POST /vendors request body.

Mirrors the writable columns on ``Vendor`` (``app/models/vendors/vendor.py``)
and the canonical category tuple in ``app/core/vendor_enums.py``.

Server-managed fields (``id``, ``organization_id``, ``user_id``,
``last_used_at``, ``deleted_at``, ``created_at``, ``updated_at``) are NOT
accepted here — they're either resolved from the request context or
populated by the persistence layer. ``extra='forbid'`` defends against a
malicious client trying to inject ``organization_id`` or ``user_id`` via
the body.
"""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.vendor_enums import VENDOR_CATEGORIES

# Bounds mirror the ``Vendor`` model's String() lengths.
_NAME_MAX_LEN = 255
_PHONE_MAX_LEN = 50
_EMAIL_MAX_LEN = 255
_ADDRESS_MAX_LEN = 500


class VendorCreateRequest(BaseModel):
    """Body for POST /vendors."""

    name: str = Field(min_length=1, max_length=_NAME_MAX_LEN)
    category: str

    phone: str | None = Field(default=None, max_length=_PHONE_MAX_LEN)
    email: str | None = Field(default=None, max_length=_EMAIL_MAX_LEN)
    address: str | None = Field(default=None, max_length=_ADDRESS_MAX_LEN)

    hourly_rate: Decimal | None = Field(default=None, ge=0)
    flat_rate_notes: str | None = None

    preferred: bool = False
    notes: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "VendorCreateRequest":
        if self.category not in VENDOR_CATEGORIES:
            raise ValueError(
                f"category must be one of {VENDOR_CATEGORIES}, got {self.category!r}",
            )
        return self
