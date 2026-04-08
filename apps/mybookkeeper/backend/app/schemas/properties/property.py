import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.properties.property import PropertyType
from app.models.properties.property_classification import PropertyClassification


class ActivityPeriodRead(BaseModel):
    id: int
    property_id: uuid.UUID
    active_from: datetime
    active_until: datetime

    model_config = {"from_attributes": True}


class PropertyRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    address: str | None = None
    classification: PropertyClassification = PropertyClassification.UNCLASSIFIED
    type: PropertyType | None = None
    is_active: bool = True
    external_id: str | None = None
    external_source: str | None = None
    purchase_price: Decimal | None = None
    land_value: Decimal | None = None
    date_placed_in_service: date | None = None
    property_class: str | None = None
    personal_use_days: int = 0
    activity_periods: list[ActivityPeriodRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
