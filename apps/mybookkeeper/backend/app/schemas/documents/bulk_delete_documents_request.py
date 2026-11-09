import uuid

from pydantic import BaseModel, Field

from app.core.document_constants import MAX_BULK_DELETE_DOCUMENT_IDS


class BulkDeleteDocumentsRequest(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_BULK_DELETE_DOCUMENT_IDS)
