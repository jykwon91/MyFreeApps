"""Request body for PATCH /channel-listings/{id}."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

_EXTERNAL_ID_MAX_LEN = 120
_EXTERNAL_URL_MAX_LEN = 500
_ICAL_URL_MAX_LEN = 1000
_TOKEN_MAX_LEN = 255


class ChannelListingUpdateRequest(BaseModel):
    """Partial update — fields not in body remain unchanged.

    ``channel_id`` and ``listing_id`` are immutable post-create; switching
    a row's channel requires delete + recreate so the (listing, channel)
    UNIQUE invariant stays clean.
    """

    external_url: HttpUrl | None = Field(default=None)
    external_id: str | None = Field(
        default=None, max_length=_EXTERNAL_ID_MAX_LEN,
    )
    ical_import_url: HttpUrl | None = Field(default=None)
    ical_import_secret_token: str | None = Field(
        default=None, max_length=_TOKEN_MAX_LEN,
    )

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_url_constraints(self) -> "ChannelListingUpdateRequest":
        if self.external_url is not None:
            url_str = str(self.external_url)
            if len(url_str) > _EXTERNAL_URL_MAX_LEN:
                raise ValueError(
                    f"external_url must be at most {_EXTERNAL_URL_MAX_LEN} characters",
                )
            if self.external_url.scheme not in ("http", "https"):
                raise ValueError("external_url must use http or https scheme")
        if self.ical_import_url is not None:
            url_str = str(self.ical_import_url)
            if len(url_str) > _ICAL_URL_MAX_LEN:
                raise ValueError(
                    f"ical_import_url must be at most {_ICAL_URL_MAX_LEN} characters",
                )
            if self.ical_import_url.scheme not in ("http", "https"):
                raise ValueError("ical_import_url must use http or https scheme")
        return self

    def to_update_dict(self) -> dict[str, object]:
        """Serialize only the fields the caller explicitly set.

        Distinguishes ``"not in body"`` from ``"explicitly null"`` via
        ``model_dump(exclude_unset=True)``. Pydantic's ``HttpUrl`` is
        coerced to plain ``str`` so the repo persists a string column.
        """
        raw = self.model_dump(exclude_unset=True)
        for url_field in ("external_url", "ical_import_url"):
            if url_field in raw and raw[url_field] is not None:
                raw[url_field] = str(raw[url_field])
        return raw
