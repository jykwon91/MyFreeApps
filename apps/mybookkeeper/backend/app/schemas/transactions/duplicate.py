import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field, model_validator

from app.core.transaction_bulk_constants import MAX_BULK_TRANSACTION_IDS


class DuplicateTransactionRead(BaseModel):
    id: uuid.UUID
    transaction_date: date
    vendor: str | None = None
    description: str | None = None
    amount: Decimal
    transaction_type: str
    category: str
    property_id: uuid.UUID | None = None
    payment_method: str | None = None
    channel: str | None = None
    tags: list[str] = []
    status: str
    source_document_id: uuid.UUID | None = None
    source_file_name: str | None = None
    is_manual: bool = False
    created_at: datetime
    linked_document_ids: list[uuid.UUID] = []

    model_config = {"from_attributes": True}


class DuplicatePair(BaseModel):
    id: str
    transaction_a: DuplicateTransactionRead
    transaction_b: DuplicateTransactionRead
    date_diff_days: int
    property_match: bool
    confidence: str = "medium"


class DuplicatePairsResponse(BaseModel):
    pairs: list[DuplicatePair]
    total: int


class DuplicateKeepRequest(BaseModel):
    keep_id: uuid.UUID
    delete_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_BULK_TRANSACTION_IDS)

    @model_validator(mode="after")
    def _keep_id_not_deleted(self) -> "DuplicateKeepRequest":
        if self.keep_id in self.delete_ids:
            raise ValueError("keep_id must not be in delete_ids")
        return self


class DuplicateDismissRequest(BaseModel):
    transaction_ids: list[uuid.UUID]


class DuplicateMergeFieldSource(str, Enum):
    a = "a"
    b = "b"


class DuplicateMergeOverrides(BaseModel):
    transaction_date: DuplicateMergeFieldSource | None = None
    vendor: DuplicateMergeFieldSource | None = None
    description: DuplicateMergeFieldSource | None = None
    amount: DuplicateMergeFieldSource | None = None
    category: DuplicateMergeFieldSource | None = None
    property_id: DuplicateMergeFieldSource | None = None
    payment_method: DuplicateMergeFieldSource | None = None
    channel: DuplicateMergeFieldSource | None = None


class DuplicateMergeRequest(BaseModel):
    transaction_a_id: uuid.UUID
    transaction_b_id: uuid.UUID
    surviving_id: uuid.UUID
    field_overrides: DuplicateMergeOverrides = DuplicateMergeOverrides()
