"""Export endpoints for transactions, Schedule E, and tax summary."""
import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.core.rate_limit import export_limiter
from app.services.transactions import export_service

router = APIRouter(prefix="/exports", tags=["exports"])


def _check_export_rate_limit(ctx: RequestContext) -> None:
    export_limiter.check(f"export:{ctx.user_id}")


@router.get("/transactions/csv")
async def export_transactions_csv(
    property_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    transaction_type: Optional[str] = None,
    category: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    tax_year: Optional[int] = None,
    ctx: RequestContext = Depends(current_org_member),
) -> Response:
    _check_export_rate_limit(ctx)
    content = await export_service.export_transactions_csv(
        ctx,
        property_id=property_id,
        status=status,
        transaction_type=transaction_type,
        category=category,
        start_date=start_date,
        end_date=end_date,
        tax_year=tax_year,
    )
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )


@router.get("/transactions/pdf")
async def export_transactions_pdf(
    property_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    transaction_type: Optional[str] = None,
    category: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    tax_year: Optional[int] = None,
    ctx: RequestContext = Depends(current_org_member),
) -> Response:
    _check_export_rate_limit(ctx)
    content = await export_service.export_transactions_pdf(
        ctx,
        property_id=property_id,
        status=status,
        transaction_type=transaction_type,
        category=category,
        start_date=start_date,
        end_date=end_date,
        tax_year=tax_year,
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=transactions.pdf"},
    )


@router.get("/schedule-e/{tax_year}")
async def export_schedule_e(
    tax_year: int,
    ctx: RequestContext = Depends(current_org_member),
) -> Response:
    _check_export_rate_limit(ctx)
    content = await export_service.export_schedule_e(ctx, tax_year)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=schedule_e_{tax_year}.pdf"},
    )


@router.get("/tax-summary/{tax_year}")
async def export_tax_summary(
    tax_year: int,
    ctx: RequestContext = Depends(current_org_member),
) -> Response:
    _check_export_rate_limit(ctx)
    content = await export_service.export_tax_summary(ctx, tax_year)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=tax_summary_{tax_year}.pdf"},
    )
