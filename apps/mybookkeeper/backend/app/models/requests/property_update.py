import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.client_date_constants import CLIENT_LOCAL_DATE_MAX_SKEW_DAYS
from app.core.depreciation_input_constants import PLACED_IN_SERVICE_IN_FUTURE
from app.models.properties.property import PropertyType
from app.models.properties.property_classification import PropertyClassification


class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    classification: Optional[PropertyClassification] = None
    type: Optional[PropertyType] = None
    is_active: Optional[bool] = None
    purchase_price: Optional[Decimal] = None
    land_value: Optional[Decimal] = Field(default=None, ge=0)
    date_placed_in_service: Optional[datetime.date] = None
    rented_since: Optional[datetime.date] = None
    property_class: Optional[str] = None
    personal_use_days: Optional[int] = None

    @field_validator("date_placed_in_service")
    @classmethod
    def placed_in_service_not_in_future(cls, value: datetime.date | None) -> datetime.date | None:
        # The caller's local today can be up to a day past the server's UTC date.
        latest = datetime.datetime.now(datetime.timezone.utc).date() + datetime.timedelta(
            days=CLIENT_LOCAL_DATE_MAX_SKEW_DAYS,
        )
        if value is not None and value > latest:
            raise ValueError(PLACED_IN_SERVICE_IN_FUTURE)
        return value
