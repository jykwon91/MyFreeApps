"""Document routes — file storage, upload, download, and extraction lifecycle.

Financial CRUD (update, approve, bulk-approve) now lives in /transactions.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.common import BulkIdsRequest
from app.schemas.documents.document import DocumentRead
from app.schemas.documents.operation_responses import (
    BulkDeleteDocumentsResponse,
    CancelBatchResponse,
    EscrowPaidRequest,
    EscrowPaidResponse,
    ReExtractResponse,
    ReplaceFileResponse,
)
from app.models.responses.upload_response import AcceptUploadResponse, BatchStatusResponse, SingleStatusResponse
from app.services.documents import document_query_service, document_service, document_upload_service


router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=list[DocumentRead])
async def list_documents(
    property_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    exclude_processing: Optional[bool] = None,
    limit: int = Query(default=1000, le=5000),
    offset: int = 0,
    ctx: RequestContext = Depends(current_org_member),
) -> list[DocumentRead]:
    return await document_query_service.list_documents(
        ctx,
        property_id=property_id,
        status=status,
        exclude_processing=exclude_processing,
        limit=limit,
        offset=offset,
    )


@router.post("/upload", response_model=AcceptUploadResponse, status_code=202)
async def upload_document(
    file: UploadFile = File(...),
    property_id: Optional[uuid.UUID] = None,
    ctx: RequestContext = Depends(require_write_access),
) -> AcceptUploadResponse:
    content = await file.read()
    try:
        result = await document_upload_service.accept_upload(
            ctx, content, file.filename or "", file.content_type or "", property_id,
        )
    except ValueError as e:
        msg = str(e)
        if "limit" in msg.lower() and "MB" in msg:
            raise HTTPException(status_code=413, detail=msg)
        if "daily upload limit" in msg.lower():
            raise HTTPException(status_code=429, detail=msg)
        if "unsupported" in msg.lower():
            raise HTTPException(status_code=415, detail=msg)
        raise HTTPException(status_code=422, detail=msg)
    return AcceptUploadResponse(**result)


@router.get("/upload-status/{document_id}", response_model=SingleStatusResponse)
async def get_single_upload_status(
    document_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> SingleStatusResponse:
    result = await document_query_service.get_single_status(ctx, document_id)
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")
    return SingleStatusResponse(**result)


@router.get("/batch-status/{batch_id}", response_model=BatchStatusResponse)
async def get_batch_status(
    batch_id: str,
    ctx: RequestContext = Depends(current_org_member),
) -> BatchStatusResponse:
    result = await document_query_service.get_batch_status(ctx, batch_id)
    return BatchStatusResponse(**result)


@router.post("/batch-cancel/{batch_id}", status_code=200)
async def cancel_batch(
    batch_id: str,
    ctx: RequestContext = Depends(require_write_access),
) -> CancelBatchResponse:
    count = await document_service.cancel_batch(ctx, batch_id)
    return CancelBatchResponse(cancelled=count)


@router.get("/{document_id}", response_model=DocumentRead)
async def get_document(
    document_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
):
    doc = await document_query_service.get_document(ctx, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/{document_id}/re-extract", status_code=202)
async def re_extract_document(
    document_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> ReExtractResponse:
    try:
        found = await document_service.re_extract_document(ctx, document_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not found:
        raise HTTPException(status_code=404, detail="Document not found")
    return ReExtractResponse(status="processing")


@router.put("/{document_id}/file")
async def replace_file(
    document_id: uuid.UUID,
    file: UploadFile = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> ReplaceFileResponse:
    content = await file.read()
    try:
        await document_service.replace_file(
            ctx, document_id, content, file.filename or "", file.content_type or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ReplaceFileResponse(status="ok")


@router.get("/{document_id}/download")
async def download_document(
    document_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> Response:
    try:
        result = await document_query_service.get_document_download(ctx, document_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")
    return Response(
        content=result.content,
        media_type=result.media_type,
        headers={"Content-Disposition": result.disposition},
    )


@router.patch("/{document_id}/escrow-paid")
async def toggle_escrow_paid(
    document_id: uuid.UUID,
    body: EscrowPaidRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> EscrowPaidResponse:
    try:
        result = await document_service.set_escrow_paid(ctx, document_id, body.is_escrow_paid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return EscrowPaidResponse(**result)


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    deleted = await document_service.delete_document(ctx, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")


@router.post("/bulk-delete")
async def bulk_delete(
    body: BulkIdsRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> BulkDeleteDocumentsResponse:
    count = await document_service.bulk_delete_documents(ctx, body.ids)
    return BulkDeleteDocumentsResponse(deleted=count)
