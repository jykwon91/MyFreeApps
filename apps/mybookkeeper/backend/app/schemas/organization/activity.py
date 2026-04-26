import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


ActivityType = Literal["rental_property", "self_employment", "w2_employment", "investment"]
TaxForm = Literal["schedule_e", "schedule_c", "w2", "schedule_d"]


class ActivityCreate(BaseModel):
    label: str
    activity_type: ActivityType
    tax_form: TaxForm
    property_id: uuid.UUID | None = None


class ActivityUpdate(BaseModel):
    label: str | None = None
    is_active: bool | None = None


class ActivityRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    activity_type: str
    label: str
    tax_form: str
    property_id: uuid.UUID | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
