import uuid

from pydantic import BaseModel

from platform_shared.schemas.common import (  # noqa: F401
    CountResponse,
    StatusResponse,
    SuccessResponse,
)


class BulkIdsRequest(BaseModel):
    ids: list[uuid.UUID]
