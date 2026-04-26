import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    property_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    file_name: str | None = None
    file_type: str | None = None
    document_type: str | None = None
    file_mime_type: str | None = None
    email_message_id: str | None = None
    external_id: str | None = None
    external_source: str | None = None
    source: str = "upload"
    status: str = "processing"
    error_message: str | None = None
    batch_id: str | None = None
    is_escrow_paid: bool = False
    deleted_at: datetime | None = None

    model_config = {"from_attributes": True}
