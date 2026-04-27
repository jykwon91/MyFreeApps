"""Pydantic schema for POST /listings/{listing_id}/external-ids.

Per RENTALS_PLAN §5.1 the table allows an external link to consist of just
an `external_id`, just an `external_url`, or both — but a row with neither
populated has no business value (the partial UNIQUE on `(source, external_id)`
would also leave it un-deduped). The API rejects that case so we never
persist a useless metadata stub.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_serializer, model_validator

from app.core.listing_enums import LISTING_EXTERNAL_SOURCES

_EXTERNAL_ID_MAX_LEN = 100
_EXTERNAL_URL_MAX_LEN = 500


class ListingExternalIdCreateRequest(BaseModel):
    """Body for POST /listings/{listing_id}/external-ids.

    `source` is required and validated against the canonical sources tuple.
    `external_id` and `external_url` are individually optional but at least
    one must be provided (validated below).
    """

    source: str
    external_id: str | None = Field(default=None, min_length=1, max_length=_EXTERNAL_ID_MAX_LEN)
    external_url: HttpUrl | None = Field(default=None)

    model_config = ConfigDict(extra="forbid")

    @field_serializer("external_url")
    def _serialize_url(self, value: HttpUrl | None) -> str | None:
        """Serialize HttpUrl as a plain string for downstream service/repo use.

        Pydantic 2's HttpUrl carries scheme/host metadata; the database column
        is plain `String(500)`. We coerce explicitly so the service layer
        never has to know which Pydantic type is upstream.
        """
        return str(value) if value is not None else None

    @model_validator(mode="after")
    def _validate_business_rules(self) -> "ListingExternalIdCreateRequest":
        if self.source not in LISTING_EXTERNAL_SOURCES:
            raise ValueError(
                f"source must be one of {LISTING_EXTERNAL_SOURCES}, got {self.source!r}",
            )
        if self.external_id is None and self.external_url is None:
            raise ValueError(
                "At least one of external_id or external_url must be provided",
            )
        if self.external_url is not None:
            url_str = str(self.external_url)
            if len(url_str) > _EXTERNAL_URL_MAX_LEN:
                raise ValueError(
                    f"external_url must be at most {_EXTERNAL_URL_MAX_LEN} characters",
                )
            if self.external_url.scheme not in ("http", "https"):
                raise ValueError("external_url must use http or https scheme")
        return self
