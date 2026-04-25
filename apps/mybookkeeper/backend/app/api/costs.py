from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from app.core.config import settings
from app.core.context import RequestContext
from app.core.permissions import current_admin
from app.schemas.system.cost import CostAlert, CostSummary, CostThresholds, CostThresholdsUpdate, DailyCost, UserCost
from app.schemas.system.smtp_status import SmtpStatus, SmtpTestRequest, SmtpTestResponse
from app.services.system import cost_service, email_service

router = APIRouter(prefix="/admin/costs", tags=["admin-costs"])


@router.get("/summary", response_model=CostSummary)
async def get_cost_summary(
    _ctx: RequestContext = Depends(current_admin),
) -> CostSummary:
    return await cost_service.get_cost_summary()


@router.get("/by-user", response_model=list[UserCost])
async def get_cost_by_user(
    period: str = Query(default="today", pattern="^(today|week|month)$"),
    limit: int = Query(default=20, le=100),
    _ctx: RequestContext = Depends(current_admin),
) -> list[UserCost]:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    since_map = {
        "today": today_start,
        "week": today_start - timedelta(days=today_start.weekday()),
        "month": today_start.replace(day=1),
    }
    return await cost_service.get_cost_by_user(since_map[period], limit)


@router.get("/timeline", response_model=list[DailyCost])
async def get_cost_timeline(
    days: int = Query(default=30, le=365),
    _ctx: RequestContext = Depends(current_admin),
) -> list[DailyCost]:
    return await cost_service.get_cost_timeline(days)


@router.get("/thresholds", response_model=CostThresholds)
async def get_cost_thresholds(
    _ctx: RequestContext = Depends(current_admin),
) -> CostThresholds:
    return await cost_service.get_thresholds()


@router.get("/alerts", response_model=list[CostAlert])
async def get_active_cost_alerts(
    _ctx: RequestContext = Depends(current_admin),
) -> list[CostAlert]:
    return await cost_service.get_active_alerts()


@router.patch("/thresholds", response_model=CostThresholds)
async def update_cost_thresholds(
    updates: CostThresholdsUpdate,
    _ctx: RequestContext = Depends(current_admin),
) -> CostThresholds:
    return await cost_service.update_thresholds(updates)


@router.get("/smtp-status", response_model=SmtpStatus)
async def get_smtp_status(
    _ctx: RequestContext = Depends(current_admin),
) -> SmtpStatus:
    return SmtpStatus(
        configured=email_service.is_configured(),
        from_email=settings.email_from_address or "(not set)",
        from_name=settings.email_from_name or "(not set)",
        recipients=email_service.get_recipients(),
    )


@router.post("/smtp-test", response_model=SmtpTestResponse)
async def test_smtp(
    body: SmtpTestRequest,
    _ctx: RequestContext = Depends(current_admin),
) -> SmtpTestResponse:
    if not email_service.is_configured():
        return SmtpTestResponse(
            success=False,
            message="Email is not configured. Set SMTP_USER and SMTP_PASSWORD in your environment.",
        )
    success = email_service.send_test_email(body.email)
    if success:
        return SmtpTestResponse(success=True, message=f"Test email sent to {body.email}")
    return SmtpTestResponse(
        success=False,
        message="Failed to send test email. Check SMTP credentials and server logs.",
    )
