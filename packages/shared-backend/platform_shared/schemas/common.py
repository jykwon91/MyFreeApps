"""Generic Pydantic response schemas shared across all apps.

These three shapes appear in every app's API surface — any endpoint that
acknowledges an action (status), returns a count, or reports a boolean
outcome uses one of these. Keeping them here means MJH (and every future
app) can import from ``platform_shared`` instead of reimplementing them
as ``dict[str, Any]``.
"""
from pydantic import BaseModel


class StatusResponse(BaseModel):
    status: str


class CountResponse(BaseModel):
    count: int


class SuccessResponse(BaseModel):
    success: bool
