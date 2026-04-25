from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel

from app.models.properties.property import PropertyType
from app.models.properties.property_classification import PropertyClassification


class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    classification: Optional[PropertyClassification] = None
    type: Optional[PropertyType] = None
    is_active: Optional[bool] = None
    purchase_price: Optional[Decimal] = None
    land_value: Optional[Decimal] = None
    date_placed_in_service: Optional[date] = None
    property_class: Optional[str] = None
    personal_use_days: Optional[int] = None
