"""Request body for POST /listings/{id}/channels."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_serializer

_EXTERNAL_ID_MAX_LEN = 120
_EXTERNAL_URL_MAX_LEN = 500
_ICAL_URL_MAX_LEN = 1000
_TOKEN_MAX_LEN = 255


class ChannelListingCreateRequest(BaseModel):
    """Body for POST /listings/{listing_id}/channels.

    ``channel_id`` is required; ``external_url`` is required (we always
    want the host's listing URL on that channel — that's the "Open on
    channel" link); ``external_id`` and ``ical_import_url`` are optional.

    A row with ``ical_import_url=None`` is supported and useful — it
    represents a channel the host publishes on but which doesn't expose an
    iCal feed (or which the host hasn't pasted yet). The polling worker
    skips such rows.
    """

    channel_id: str = Field(min_length=1, max_length=40)
    external_url: HttpUrl
    external_id: str | None = Field(
        default=None, min_length=1, max_length=_EXTERNAL_ID_MAX_LEN,
    )
    ical_import_url: HttpUrl | None = Field(default=None)
    ical_import_secret_token: str | None = Field(
        default=None, min_length=1, max_length=_TOKEN_MAX_LEN,
    )

    model_config = ConfigDict(extra="forbid")

    @field_serializer("external_url")
    def _serialize_external_url(self, value: HttpUrl) -> str:
        url_str = str(value)
        if len(url_str) > _EXTERNAL_URL_MAX_LEN:
            raise ValueError(
                f"external_url must be at most {_EXTERNAL_URL_MAX_LEN} characters",
            )
        return url_str

    @field_serializer("ical_import_url")
    def _serialize_ical_url(self, value: HttpUrl | None) -> str | None:
        if value is None:
            return None
        url_str = str(value)
        if len(url_str) > _ICAL_URL_MAX_LEN:
            raise ValueError(
                f"ical_import_url must be at most {_ICAL_URL_MAX_LEN} characters",
            )
        if value.scheme not in ("http", "https"):
            raise ValueError("ical_import_url must use http or https scheme")
        return url_str
