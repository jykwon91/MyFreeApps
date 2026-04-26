import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole
from app.core.permissions import current_org_member, require_org_role
from app.schemas.system.health import HealthSummary, ResolveEventResponse, RetryFailedResponse, SystemEventRead
from app.services.system import health_service

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/summary", response_model=HealthSummary)
async def get_health_summary(
    ctx: RequestContext = Depends(current_org_member),
) -> HealthSummary:
    return await health_service.get_health_summary(ctx.organization_id)


@router.get("/events", response_model=list[SystemEventRead])
async def list_events(
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    resolved: Optional[bool] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    ctx: RequestContext = Depends(current_org_member),
) -> list[SystemEventRead]:
    events = await health_service.get_events(
        ctx.organization_id,
        event_type=event_type,
        severity=severity,
        resolved=resolved,
        limit=limit,
        offset=offset,
    )
    return list(events)


@router.post("/events/{event_id}/resolve")
async def resolve_event(
    event_id: uuid.UUID,
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> ResolveEventResponse:
    resolved = await health_service.resolve_event(event_id, ctx.organization_id)
    if not resolved:
        raise HTTPException(status_code=404, detail="Event not found")
    return ResolveEventResponse(resolved=True)


@router.post("/retry-failed")
async def retry_failed_documents(
    ctx: RequestContext = Depends(require_org_role(OrgRole.OWNER, OrgRole.ADMIN)),
) -> RetryFailedResponse:
    count = await health_service.retry_failed_documents(ctx.organization_id)
    return RetryFailedResponse(retried=count)
