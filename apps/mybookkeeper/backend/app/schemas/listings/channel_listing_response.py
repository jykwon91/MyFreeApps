"""Response schema for a (listing, channel) pair.

Includes the FULL outbound iCal URL the operator should paste into the
channel's import-calendar field — built from ``settings.app_url`` (or
``frontend_url`` fallback) + ``/api/calendar/<token>.ics``.

The token itself is exposed too — the URL-construction logic lives in the
service layer; the route is unauthenticated by design (channels poll it
without credentials), the token is the secret.
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.listings.channel_response import ChannelResponse


class ChannelListingResponse(BaseModel):
    id: str
    listing_id: str
    channel_id: str
    channel: ChannelResponse | None = None

    external_url: str | None = None
    external_id: str | None = None

    ical_import_url: str | None = None
    last_imported_at: datetime | None = None
    last_import_error: str | None = None

    ical_export_token: str
    ical_export_url: str

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
