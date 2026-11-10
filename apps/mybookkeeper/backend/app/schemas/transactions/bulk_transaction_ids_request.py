import uuid

from pydantic import BaseModel, Field

from app.core.transaction_bulk_constants import MAX_BULK_TRANSACTION_IDS


class BulkTransactionIdsRequest(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_BULK_TRANSACTION_IDS)
