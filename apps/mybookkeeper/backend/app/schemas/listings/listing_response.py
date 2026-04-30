import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.listings.listing_external_id_response import ListingExternalIdResponse
from app.schemas.listings.listing_photo_response import ListingPhotoResponse


class ListingResponse(BaseModel):
    """Full listing payload for detail views — includes photos and external IDs."""

    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    property_id: uuid.UUID

    title: str
    description: str | None = None
    # Public-form slug (T0). Always non-null after the
    # ``b2c3d4e5f6a1_public_inquiry_form_t0`` migration; declared optional so
    # newly-created Listings before flush still validate.
    slug: str | None = None

    monthly_rate: Decimal
    weekly_rate: Decimal | None = None
    nightly_rate: Decimal | None = None

    min_stay_days: int | None = None
    max_stay_days: int | None = None

    room_type: str
    private_bath: bool
    parking_assigned: bool
    furnished: bool

    status: str
    amenities: list[str]

    pets_on_premises: bool
    large_dog_disclosure: str | None = None

    photos: list[ListingPhotoResponse] = []
    external_ids: list[ListingExternalIdResponse] = []

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
