"""Log frontend JavaScript errors to the system_events table."""
from fastapi import APIRouter, Depends

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.core.rate_limit import frontend_error_limiter
from app.schemas.system.frontend_error import FrontendErrorCreate
from app.services.system.event_service import record_event

router = APIRouter(prefix="/errors", tags=["errors"])


def _check_frontend_error_rate_limit(ctx: RequestContext) -> None:
    frontend_error_limiter.check(f"frontend_error:{ctx.user_id}")


@router.post("", status_code=204)
async def report_frontend_error(
    body: FrontendErrorCreate,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    _check_frontend_error_rate_limit(ctx)
    await record_event(
        organization_id=ctx.organization_id,
        event_type="frontend_error",
        severity="error",
        message=body.message[:500],
        data={
            k: v
            for k, v in {
                "stack": body.stack,
                "url": body.url,
                "component": body.component,
                "user_id": str(ctx.user_id),
            }.items()
            if v is not None
        },
    )
