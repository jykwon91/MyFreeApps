"""HTTP routes for the Savings page.

Route prefix: /savings. Everything is scoped to the signed-in person within
the workspace. "Research now" opens a run and researches after the response,
so the request returns at once and the page polls the overview.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.core.context import RequestContext
from app.core.permissions import current_org_member, reject_demo_org_write
from app.core.savings_constants import MANUAL_RUNS_PER_DAY
from app.repositories.savings.run_already_running_error import RunAlreadyRunningError
from app.schemas.savings.savings_idea_response import SavingsIdeaResponse
from app.schemas.savings.savings_idea_status_update_request import SavingsIdeaStatusUpdateRequest
from app.schemas.savings.savings_overview_response import SavingsOverviewResponse
from app.schemas.savings.savings_research_started_response import SavingsResearchStartedResponse
from app.schemas.savings.savings_settings_update_request import SavingsSettingsUpdateRequest
from app.services.savings import savings_overview_service, savings_research_service
from app.services.savings.manual_run_limit_error import ManualRunLimitError
from app.services.savings.research_disabled_error import ResearchDisabledError
from app.services.savings.savings_idea_not_found_error import SavingsIdeaNotFoundError

router = APIRouter(prefix="/savings", tags=["savings"])


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


@router.get("", response_model=SavingsOverviewResponse)
async def get_savings(ctx: RequestContext = Depends(current_org_member)) -> SavingsOverviewResponse:
    return await savings_overview_service.get_overview(
        organization_id=ctx.organization_id, user_id=ctx.user_id,
    )


@router.put("/settings", response_model=SavingsOverviewResponse)
async def update_settings(
    payload: SavingsSettingsUpdateRequest,
    background_tasks: BackgroundTasks,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> SavingsOverviewResponse:
    await savings_overview_service.set_research_enabled(
        organization_id=ctx.organization_id, user_id=ctx.user_id, enabled=payload.enabled,
    )
    first_run_id = await savings_research_service.start_first_run(
        organization_id=ctx.organization_id, user_id=ctx.user_id,
    )
    if first_run_id is not None:
        background_tasks.add_task(
            savings_research_service.execute_run,
            first_run_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
        )
    return await savings_overview_service.get_overview(
        organization_id=ctx.organization_id, user_id=ctx.user_id,
    )


@router.post("/research", response_model=SavingsResearchStartedResponse, status_code=status.HTTP_202_ACCEPTED)
async def research_now(
    background_tasks: BackgroundTasks,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> SavingsResearchStartedResponse:
    try:
        run_id = await savings_research_service.start_manual_run(
            organization_id=ctx.organization_id, user_id=ctx.user_id,
        )
    except ResearchDisabledError as exc:
        raise HTTPException(status_code=409, detail="Turn on savings research first.") from exc
    except RunAlreadyRunningError as exc:
        raise HTTPException(status_code=409, detail="I'm already researching — this takes a few minutes.") from exc
    except ManualRunLimitError as exc:
        raise HTTPException(
            status_code=429,
            detail=f"You've used all {MANUAL_RUNS_PER_DAY} research runs for today. Try again later.",
            headers={"Retry-After": str(max(int((exc.next_available_at - _now()).total_seconds()), 1))},
        ) from exc
    background_tasks.add_task(
        savings_research_service.execute_run,
        run_id,
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
    )
    return SavingsResearchStartedResponse(run_id=run_id)


@router.patch("/ideas/{idea_id}", response_model=SavingsIdeaResponse)
async def update_idea_status(
    idea_id: uuid.UUID,
    payload: SavingsIdeaStatusUpdateRequest,
    ctx: RequestContext = Depends(reject_demo_org_write),
) -> SavingsIdeaResponse:
    try:
        return await savings_overview_service.set_idea_status(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            idea_id=idea_id,
            status=payload.status,
        )
    except SavingsIdeaNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Savings idea not found") from exc
