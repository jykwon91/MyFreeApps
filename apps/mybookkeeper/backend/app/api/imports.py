"""Import endpoints for bank CSV files."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.schemas.transactions.imports import ImportResult
from app.services.transactions import import_service

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("/bank-csv", response_model=ImportResult)
async def import_bank_csv(
    file: UploadFile,
    property_id: Optional[uuid.UUID] = Query(None),
    ctx: RequestContext = Depends(require_write_access),
) -> ImportResult:
    content_bytes = await file.read()
    try:
        return await import_service.import_bank_csv_file(
            ctx, content_bytes, file.filename or "", property_id,
        )
    except ValueError as e:
        status = 413 if "too large" in str(e) else 422 if "format" in str(e) or "No transactions" in str(e) else 400
        raise HTTPException(status_code=status, detail=str(e))
