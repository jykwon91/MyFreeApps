from datetime import datetime

from app.db.session import AsyncSessionLocal
from app.models.system.audit_log import AuditLog
from app.repositories import audit_repo


async def list_audit_logs(
    *,
    table_name: str | None = None,
    record_id: str | None = None,
    operation: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[AuditLog]:
    async with AsyncSessionLocal() as db:
        result = await audit_repo.list_filtered(
            db,
            table_name=table_name,
            record_id=record_id,
            operation=operation,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )
        return list(result)
