"""HTTP routes for the Documents domain.

Supports two creation modes via ``POST /documents``:
  - JSON body (``Content-Type: application/json``) for text-only documents.
  - Multipart form (``Content-Type: multipart/form-data``) for file uploads.

All routes require authentication. Every operation is tenant-scoped so
cross-user probing returns 404 — the same response as a genuine miss.

Layered architecture: routes delegate to ``document_service``. No ORM
primitives are imported here.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.storage import StorageNotConfiguredError
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.documents.document_create_request import DocumentCreateRequest
from app.schemas.documents.document_response import DocumentResponse
from app.schemas.documents.document_update_request import DocumentUpdateRequest
from app.services.documents import document_service
from app.services.documents.document_service import ApplicationNotOwnedError
from app.services.jobs.resume_validator import ResumeRejected

router = APIRouter(prefix="/documents", tags=["documents"])

_NOT_FOUND_DETAIL = "Document not found"
_MAX_LIMIT = 500


# ---------------------------------------------------------------------------
# POST /documents — JSON body (text-only document)
# ---------------------------------------------------------------------------


@router.post("", response_model=DocumentResponse, status_code=201)
async def create_document(
    payload: DocumentCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> DocumentResponse:
    """Create a text-body document (e.g. a cover-letter draft).

    ``body`` must be non-empty. To upload a file, use ``POST /documents/upload``.
    Returns 422 if ``application_id`` does not belong to the caller.
    """
    if not payload.body:
        raise HTTPException(status_code=422, detail="body is required for text-only documents")

    try:
        return await document_service.create_text_document(db, user.id, payload)
    except ApplicationNotOwnedError as exc:
        raise HTTPException(
            status_code=422,
            detail="application_id does not reference an accessible application",
        ) from exc


# ---------------------------------------------------------------------------
# POST /documents/upload — multipart file upload
# ---------------------------------------------------------------------------


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    title: str = Form(...),
    kind: str = Form(...),
    application_id: uuid.UUID | None = Form(default=None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> DocumentResponse:
    """Upload a file-backed document (PDF, DOCX, or plain text).

    Returns 413 if the file exceeds 25 MB.
    Returns 415 if the file type is unsupported.
    Returns 503 if MinIO is not configured.
    Returns 422 if ``application_id`` does not belong to the caller.
    """
    content = await file.read()

    try:
        return await document_service.create_file_document(
            db,
            user.id,
            title=title,
            kind=kind,
            application_id=application_id,
            file_bytes=content,
            filename=file.filename or "document",
            declared_content_type=file.content_type or "",
        )
    except ApplicationNotOwnedError as exc:
        raise HTTPException(
            status_code=422,
            detail="application_id does not reference an accessible application",
        ) from exc
    except ResumeRejected as exc:
        msg = str(exc)
        status_code = 413 if "exceeds" in msg else 415
        raise HTTPException(status_code=status_code, detail=msg) from exc
    except StorageNotConfiguredError as exc:
        raise HTTPException(
            status_code=503,
            detail="File storage is not available — contact support",
        ) from exc


# ---------------------------------------------------------------------------
# GET /documents — list
# ---------------------------------------------------------------------------


@router.get("", response_model=dict)
async def list_documents(
    application_id: uuid.UUID | None = Query(default=None),
    kind: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    """Return the caller's non-deleted documents.

    Response shape: ``{"items": [DocumentResponse...], "total": int}``.
    Filters:
    - ``application_id``: narrow to documents linked to a specific application.
    - ``kind``: narrow to a specific document kind.
    """
    items = await document_service.list_for_user(
        db,
        user.id,
        application_id=application_id,
        kind=kind,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [item.model_dump(mode="json") for item in items],
        "total": len(items),
    }


# ---------------------------------------------------------------------------
# GET /documents/{id} — single
# ---------------------------------------------------------------------------


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> DocumentResponse:
    """Return a single document. 404 if not found or belongs to another user."""
    doc = await document_service.get_for_user(db, user.id, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return doc


# ---------------------------------------------------------------------------
# PATCH /documents/{id} — partial update
# ---------------------------------------------------------------------------


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: uuid.UUID,
    payload: DocumentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> DocumentResponse:
    """Partially update a document (title, body, kind, application_id).

    File content cannot be replaced — create a new document instead.
    Returns 404 if not found. Returns 422 if ``application_id`` is set but
    does not belong to the caller.
    """
    try:
        doc = await document_service.update_document(db, user.id, document_id, payload)
    except ApplicationNotOwnedError as exc:
        raise HTTPException(
            status_code=422,
            detail="application_id does not reference an accessible application",
        ) from exc
    if doc is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return doc


# ---------------------------------------------------------------------------
# DELETE /documents/{id} — soft delete
# ---------------------------------------------------------------------------


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    """Soft-delete a document. Idempotent. Returns 404 if not found."""
    deleted = await document_service.soft_delete_document(db, user.id, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# GET /documents/{id}/download — presigned URL
# ---------------------------------------------------------------------------


@router.get("/{document_id}/download")
async def download_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    """Return a short-lived presigned download URL for the document's file.

    Returns ``{"url": "<presigned URL>"}`` valid for 1 hour.
    Returns 404 if the document is not found or has no associated file.
    Returns 503 if MinIO is not configured.
    """
    try:
        url = await document_service.presigned_download_url(db, user.id, document_id)
    except StorageNotConfiguredError as exc:
        raise HTTPException(
            status_code=503,
            detail="File storage is not available — contact support",
        ) from exc
    if url is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return {"url": url}
