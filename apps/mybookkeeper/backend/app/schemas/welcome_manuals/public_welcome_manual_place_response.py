from pydantic import BaseModel, ConfigDict


class PublicWelcomeManualPlaceResponse(BaseModel):
    """Guest-safe place (restaurant recommendation) projection. No ``id``,
    ``manual_id``, or ``created_at``."""

    name: str
    cuisine: str
    price_tier: str | None = None
    note: str | None = None
    map_url: str | None = None
    display_order: int

    model_config = ConfigDict(from_attributes=True)
