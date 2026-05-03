"""Pydantic schema for POST /companies request body.

Mirrors the writable columns on ``Company`` (``app/models/company/company.py``).
Server-managed columns (``id``, ``user_id``, ``created_at``, ``updated_at``)
are NOT accepted — they're either resolved from the request context
(``user_id``) or populated by the persistence layer.

``extra='forbid'`` defends against a malicious client trying to inject
``user_id`` via the body. The repository layer additionally applies an
explicit allowlist of writable columns as defense in depth.
"""
from __future__ import annotations

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_serializer

# Bounds mirror the ``Company`` model's String() lengths.
_NAME_MAX_LEN = 200
_DOMAIN_MAX_LEN = 255
_INDUSTRY_MAX_LEN = 100
_SIZE_RANGE_MAX_LEN = 20
_HQ_MAX_LEN = 200
_EXTERNAL_REF_MAX_LEN = 255
_EXTERNAL_SOURCE_MAX_LEN = 50
_CRUNCHBASE_MAX_LEN = 50
_LOGO_URL_MAX_LEN = 2048
_DESCRIPTION_MAX_LEN = 5000


class CompanyCreateRequest(BaseModel):
    """Body for POST /companies."""

    name: str = Field(min_length=1, max_length=_NAME_MAX_LEN)

    primary_domain: str | None = Field(default=None, max_length=_DOMAIN_MAX_LEN)
    logo_url: AnyHttpUrl | None = None
    industry: str | None = Field(default=None, max_length=_INDUSTRY_MAX_LEN)
    size_range: str | None = Field(default=None, max_length=_SIZE_RANGE_MAX_LEN)
    hq_location: str | None = Field(default=None, max_length=_HQ_MAX_LEN)
    description: str | None = Field(default=None, max_length=_DESCRIPTION_MAX_LEN)
    external_ref: str | None = Field(default=None, max_length=_EXTERNAL_REF_MAX_LEN)
    external_source: str | None = Field(default=None, max_length=_EXTERNAL_SOURCE_MAX_LEN)
    crunchbase_id: str | None = Field(default=None, max_length=_CRUNCHBASE_MAX_LEN)

    model_config = ConfigDict(extra="forbid")

    @field_serializer("logo_url")
    def _serialize_logo_url(self, value: AnyHttpUrl | None) -> str | None:
        """Coerce AnyHttpUrl to plain string for DB storage."""
        return str(value) if value is not None else None
