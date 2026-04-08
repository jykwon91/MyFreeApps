from pydantic import BaseModel


class AcceptUploadResponse(BaseModel):
    document_id: str
    batch_id: str | None
    batch_total: int


class BatchStatusResponse(BaseModel):
    batch_id: str
    total: int
    completed: int
    failed: int
    status: str


class SingleStatusResponse(BaseModel):
    status: str
