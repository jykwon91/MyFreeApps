import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


FilerType = Literal["primary", "spouse"]


class TaxpayerProfileRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    filer_type: FilerType
    ssn_masked: str | None
    first_name: str | None
    last_name: str | None
    middle_initial: str | None
    date_of_birth: str | None
    street_address: str | None
    apartment_unit: str | None
    city: str | None
    state: str | None
    zip_code: str | None
    phone: str | None
    occupation: str | None
    created_at: datetime
    updated_at: datetime


class TaxpayerProfileWrite(BaseModel):
    ssn: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    middle_initial: str | None = None
    date_of_birth: str | None = None
    street_address: str | None = None
    apartment_unit: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    phone: str | None = None
    occupation: str | None = None
