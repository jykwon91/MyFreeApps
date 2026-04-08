from fastapi import APIRouter, Depends, Query

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.schemas.tax.source_document import SourceDocumentsResponse
from app.services.tax import tax_return_service

router = APIRouter(prefix="/tax-documents", tags=["tax-documents"])


@router.get("", response_model=SourceDocumentsResponse)
async def list_tax_documents(
    tax_year: int | None = Query(None),
    ctx: RequestContext = Depends(current_org_member),
) -> SourceDocumentsResponse:
    return await tax_return_service.list_all_source_documents(ctx, tax_year=tax_year)
