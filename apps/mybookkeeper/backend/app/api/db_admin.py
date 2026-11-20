"""Admin-only database query and maintenance endpoints.

These endpoints allow the operator to run read-only SQL queries and
perform common data maintenance operations (property reassignment,
sub_category fixes, duplicate cleanup, re-extraction).

Gated solely by the static X-Admin-Api-Key header (for MCP/CLI tooling
without 2FA); no user role or JWT is involved.
"""
from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import settings
from app.core.security import admin_api_key_matches
from app.schemas.system.db_admin import (
    BulkPropertyReassignRequest,
    BulkSoftDeleteRequest,
    BulkSubCategoryFixRequest,
    BulkUpdateResponse,
    DbQueryRequest,
    DbQueryResponse,
    ReExtractDocumentsRequest,
)
from app.services.system import db_admin_service

router = APIRouter(prefix="/admin/db", tags=["admin-db"])


async def _require_admin_access(
    x_admin_api_key: str | None = Header(None),
) -> None:
    """Require a valid static admin API key (compared in constant time)."""
    if x_admin_api_key:
        if not settings.admin_api_key:
            raise HTTPException(status_code=503, detail="Admin API key not configured")
        if not admin_api_key_matches(x_admin_api_key, settings.admin_api_key):
            raise HTTPException(status_code=403, detail="Invalid admin API key")
        return
    raise HTTPException(status_code=401, detail="X-Admin-Api-Key header required")


@router.post("/query", response_model=DbQueryResponse)
async def run_query(
    body: DbQueryRequest,
    _: None = Depends(_require_admin_access),
) -> DbQueryResponse:
    """Execute a read-only SQL query. SELECT only, max 200 rows."""
    try:
        return await db_admin_service.run_readonly_query(body.sql)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reassign-property", response_model=BulkUpdateResponse)
async def reassign_property(
    body: BulkPropertyReassignRequest,
    _: None = Depends(_require_admin_access),
) -> BulkUpdateResponse:
    """Reassign transactions to a different property by vendor + filename pattern."""
    return await db_admin_service.reassign_property(body)


@router.post("/fix-sub-category", response_model=BulkUpdateResponse)
async def fix_sub_category(
    body: BulkSubCategoryFixRequest,
    _: None = Depends(_require_admin_access),
) -> BulkUpdateResponse:
    """Fix utility sub_category for transactions matching vendor + description."""
    return await db_admin_service.fix_sub_category(body)


@router.post("/soft-delete", response_model=BulkUpdateResponse)
async def soft_delete_transactions(
    body: BulkSoftDeleteRequest,
    _: None = Depends(_require_admin_access),
) -> BulkUpdateResponse:
    """Soft-delete duplicate transactions matching criteria."""
    return await db_admin_service.soft_delete_transactions(body)


@router.post("/re-extract", response_model=BulkUpdateResponse)
async def re_extract_documents(
    body: ReExtractDocumentsRequest,
    _: None = Depends(_require_admin_access),
) -> BulkUpdateResponse:
    """Queue documents for re-extraction with the current prompt."""
    return await db_admin_service.queue_reextraction(body)
