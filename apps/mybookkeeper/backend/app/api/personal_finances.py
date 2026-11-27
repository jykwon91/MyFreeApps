"""HTTP routes for the personal finances page.

Route prefix: /personal-finances.
"""
from __future__ import annotations

import datetime as _dt

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.personal_finances.personal_finances_response import (
    PersonalFinancesResponse,
)
from app.services.personal_finances import personal_finances_service

router = APIRouter(prefix="/personal-finances", tags=["personal-finances"])


@router.get("", response_model=PersonalFinancesResponse)
async def get_personal_finances(
    start: str | None = Query(None, description='First month, "YYYY-MM"; the bank history start when left out.'),
    end: str | None = Query(None, description='Last month, "YYYY-MM"; this month when left out.'),
    ctx: RequestContext = Depends(current_org_member),
) -> PersonalFinancesResponse:
    try:
        return await personal_finances_service.get_personal_finances(
            organization_id=ctx.organization_id, start=start, end=end, today=_dt.date.today(),
        )
    except personal_finances_service.InvalidPersonalFinancesRangeError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown range: {exc}") from exc
