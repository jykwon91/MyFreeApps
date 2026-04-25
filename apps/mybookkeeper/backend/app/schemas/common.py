import uuid

from pydantic import BaseModel


class BulkIdsRequest(BaseModel):
    ids: list[uuid.UUID]


class StatusResponse(BaseModel):
    status: str


class CountResponse(BaseModel):
    count: int


class SuccessResponse(BaseModel):
    success: bool
