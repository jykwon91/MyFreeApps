"""Request body for PATCH /channel-listings/{id}."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

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

    def to_update_dict(self) -> dict[str, object]:
        """Serialize only the fields the caller explicitly set.

        Distinguishes ``"not in body"`` from ``"explicitly null"`` via
        ``model_dump(exclude_unset=True)``. Pydantic's ``HttpUrl`` is
        coerced to plain ``str`` so the repo persists a string column.
        """
        raw = self.model_dump(exclude_unset=True)
        for url_field in ("external_url", "ical_import_url"):
            if url_field in raw and raw[url_field] is not None:
                url_str = str(raw[url_field])
                if url_field == "external_url" and len(url_str) > _EXTERNAL_URL_MAX_LEN:
                    raise ValueError(
                        f"external_url must be at most {_EXTERNAL_URL_MAX_LEN} characters",
                    )
                if url_field == "ical_import_url" and len(url_str) > _ICAL_URL_MAX_LEN:
                    raise ValueError(
                        f"ical_import_url must be at most {_ICAL_URL_MAX_LEN} characters",
                    )
                raw[url_field] = url_str
        return raw
