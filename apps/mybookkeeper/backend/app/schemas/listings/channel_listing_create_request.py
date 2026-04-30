"""Request body for POST /listings/{id}/channels."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_serializer, model_validator

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

    @model_validator(mode="after")
    def _validate_url_constraints(self) -> "ChannelListingCreateRequest":
        # Pydantic's HttpUrl already enforces a valid http/https URL — we
        # just enforce our own column-length limits and scheme allowlist.
        external_url_str = str(self.external_url)
        if len(external_url_str) > _EXTERNAL_URL_MAX_LEN:
            raise ValueError(
                f"external_url must be at most {_EXTERNAL_URL_MAX_LEN} characters",
            )
        if self.external_url.scheme not in ("http", "https"):
            raise ValueError("external_url must use http or https scheme")

        if self.ical_import_url is not None:
            ical_url_str = str(self.ical_import_url)
            if len(ical_url_str) > _ICAL_URL_MAX_LEN:
                raise ValueError(
                    f"ical_import_url must be at most {_ICAL_URL_MAX_LEN} characters",
                )
            if self.ical_import_url.scheme not in ("http", "https"):
                raise ValueError("ical_import_url must use http or https scheme")
        return self

    @field_serializer("external_url")
    def _serialize_external_url(self, value: HttpUrl) -> str:
        return str(value)

    @field_serializer("ical_import_url")
    def _serialize_ical_url(self, value: HttpUrl | None) -> str | None:
        return str(value) if value is not None else None
