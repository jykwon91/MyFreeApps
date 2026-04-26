from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.permissions import current_admin
from app.models.user.user import User
from app.schemas.system.audit_log import AuditLogRead
from app.services.system import audit_service

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogRead])
async def get_audit_logs(
    table_name: Optional[str] = None,
    record_id: Optional[str] = None,
    operation: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    user: User = Depends(current_admin),
) -> list[AuditLogRead]:
    return await audit_service.list_audit_logs(
        table_name=table_name,
        record_id=record_id,
        operation=operation,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )
