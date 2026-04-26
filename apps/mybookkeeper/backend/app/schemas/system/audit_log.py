from datetime import datetime

from pydantic import BaseModel


class AuditLogRead(BaseModel):
    id: int
    table_name: str
    record_id: str
    operation: str
    field_name: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    changed_by: str | None = None
    changed_at: datetime

    model_config = {"from_attributes": True}
