import uuid
from typing import Optional

from pydantic import BaseModel


class TenantCreate(BaseModel):
    property_id: uuid.UUID
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
