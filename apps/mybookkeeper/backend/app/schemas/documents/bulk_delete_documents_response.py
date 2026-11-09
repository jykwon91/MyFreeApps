import uuid

from pydantic import BaseModel

from app.schemas.documents.skipped_document import SkippedDocument


class BulkDeleteDocumentsResponse(BaseModel):
    deleted: list[uuid.UUID]
    skipped: list[SkippedDocument]
