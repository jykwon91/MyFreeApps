import uuid
from datetime import datetime

from pydantic import BaseModel


class LinkTokenResponse(BaseModel):
    link_token: str
    expiration: str


class ExchangeRequest(BaseModel):
    public_token: str
    institution_id: str | None = None
    institution_name: str | None = None


class PlaidItemRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    plaid_item_id: str
    institution_id: str | None = None
    institution_name: str | None = None
    status: str
    error_code: str | None = None
    last_synced_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PlaidAccountRead(BaseModel):
    id: uuid.UUID
    plaid_item_id: uuid.UUID
    organization_id: uuid.UUID
    plaid_account_id: str
    property_id: uuid.UUID | None = None
    name: str
    official_name: str | None = None
    account_type: str
    account_subtype: str | None = None
    mask: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PlaidAccountUpdate(BaseModel):
    property_id: uuid.UUID | None = None


class PlaidSyncResponse(BaseModel):
    status: str
    records_added: int
