"""Pydantic schema for PATCH /listings/{listing_id}/external-ids/{external_id_pk}.

Only `external_id` and `external_url` are mutable. `source` is immutable —
moving a row to a different source is delete + re-create, which preserves
the (source, external_id) partial UNIQUE invariant cleanly.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_serializer, model_validator

_EXTERNAL_ID_MAX_LEN = 100
_EXTERNAL_URL_MAX_LEN = 500


class ListingExternalIdUpdateRequest(BaseModel):
    external_id: str | None = Field(default=None, max_length=_EXTERNAL_ID_MAX_LEN)
    external_url: HttpUrl | None = Field(default=None)

    model_config = ConfigDict(extra="forbid")

    @field_serializer("external_url")
    def _serialize_url(self, value: HttpUrl | None) -> str | None:
        return str(value) if value is not None else None

    @model_validator(mode="after")
    def _validate_url_length(self) -> "ListingExternalIdUpdateRequest":
        if self.external_url is not None:
            url_str = str(self.external_url)
            if len(url_str) > _EXTERNAL_URL_MAX_LEN:
                raise ValueError(
                    f"external_url must be at most {_EXTERNAL_URL_MAX_LEN} characters",
                )
            if self.external_url.scheme not in ("http", "https"):
                raise ValueError("external_url must use http or https scheme")
        return self

    def to_update_dict(self) -> dict[str, object]:
        """Serialize only the fields the caller explicitly set.

        `model_dump(exclude_unset=True)` distinguishes "not in request body"
        from "explicitly set to null" — letting the API support clearing a
        field by sending `null` while leaving omitted fields unchanged.

        Pydantic's HttpUrl serialises to its own type; we coerce to str so
        the repo/setattr path stores a plain string in the column.
        """
        raw = self.model_dump(exclude_unset=True)
        if "external_url" in raw and raw["external_url"] is not None:
            raw["external_url"] = str(raw["external_url"])
        return raw
