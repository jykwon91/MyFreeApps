"""Pydantic schema for PATCH /companies/{id} request body.

PATCH semantics — every field optional, only explicitly-provided fields are
applied. The repository layer applies an explicit allowlist on top of this
schema's ``extra='forbid'`` per the project rule:
"Always validate field names against an explicit allowlist before applying
dynamic updates."

``user_id`` and ``id`` are intentionally absent — they are not writable. The
``extra='forbid'`` config rejects any attempt to set them via the body with
HTTP 422.
"""
from __future__ import annotations

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_serializer, field_validator

from app.core.company_domain import normalize_company_domain
from app.core.enums import CompanySizeRange

# Bounds mirror the ``Company`` model's String() lengths.
_NAME_MAX_LEN = 200
_INDUSTRY_MAX_LEN = 100
_SIZE_RANGE_MAX_LEN = 20
_HQ_MAX_LEN = 200
_EXTERNAL_REF_MAX_LEN = 255
_EXTERNAL_SOURCE_MAX_LEN = 50
_CRUNCHBASE_MAX_LEN = 50
_DESCRIPTION_MAX_LEN = 5000
# ``primary_domain`` accepts a whole website URL and normalises it to a bare
# host, so the raw input may be far longer than the String(255) column; the
# normaliser caps the stored value at 253 characters.
_DOMAIN_INPUT_MAX_LEN = 2048


class CompanyUpdateRequest(BaseModel):
    """Body for PATCH /companies/{id} — every field optional."""

    name: str | None = Field(default=None, min_length=1, max_length=_NAME_MAX_LEN)
    primary_domain: str | None = Field(default=None, max_length=_DOMAIN_INPUT_MAX_LEN)
    logo_url: AnyHttpUrl | None = None
    industry: str | None = Field(default=None, max_length=_INDUSTRY_MAX_LEN)
    size_range: str | None = Field(default=None, max_length=_SIZE_RANGE_MAX_LEN)
    hq_location: str | None = Field(default=None, max_length=_HQ_MAX_LEN)
    description: str | None = Field(default=None, max_length=_DESCRIPTION_MAX_LEN)
    external_ref: str | None = Field(default=None, max_length=_EXTERNAL_REF_MAX_LEN)
    external_source: str | None = Field(default=None, max_length=_EXTERNAL_SOURCE_MAX_LEN)
    crunchbase_id: str | None = Field(default=None, max_length=_CRUNCHBASE_MAX_LEN)

    model_config = ConfigDict(extra="forbid")

    @field_validator("primary_domain")
    @classmethod
    def _normalize_primary_domain(cls, value: str | None) -> str | None:
        """Store the bare lowercase host; reject anything that isn't a domain (422)."""
        return normalize_company_domain(value)

    @field_validator("size_range")
    @classmethod
    def _validate_size_range(cls, value: str | None) -> str | None:
        """Mirror ``chk_company_size_range`` so a bad value is a 422, not a DB error."""
        if value is not None and value not in CompanySizeRange.ALL:
            raise ValueError(f"size_range must be one of {CompanySizeRange.ALL}, got {value!r}")
        return value

    @field_serializer("logo_url")
    def _serialize_logo_url(self, value: AnyHttpUrl | None) -> str | None:
        """Coerce AnyHttpUrl to plain string for DB storage."""
        return str(value) if value is not None else None

    def to_update_dict(self) -> dict[str, object]:
        """Return only the explicitly-provided fields (Pydantic ``exclude_unset``).

        Used by the service layer to pass to ``company_repository.update`` —
        the repo layer applies the allowlist filter.
        """
        return self.model_dump(exclude_unset=True)
