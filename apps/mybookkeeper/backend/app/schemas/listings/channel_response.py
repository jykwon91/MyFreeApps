from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ChannelResponse(BaseModel):
    """Static channel metadata served to the frontend.

    Mirrors the ``channels`` table 1:1. The frontend uses this to populate
    the "Add channel" dropdown and to render channel-name labels.
    """

    id: str
    name: str
    supports_ical_export: bool
    supports_ical_import: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
