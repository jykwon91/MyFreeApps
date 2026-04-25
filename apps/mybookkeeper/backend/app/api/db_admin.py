"""Admin-only database query and maintenance endpoints.

These endpoints allow superusers to run read-only SQL queries and
perform common data maintenance operations (property reassignment,
sub_category fixes, duplicate cleanup, re-extraction).

Supports two auth methods:
- Bearer token (superuser JWT)
- X-Admin-Api-Key header (for MCP/CLI tooling without 2FA)
"""
import logging

from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import settings
from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import db_admin_repo
from app.schemas.system.db_admin import (
    BulkPropertyReassignRequest,
    BulkSoftDeleteRequest,
    BulkSubCategoryFixRequest,
    BulkUpdateResponse,
    DbQueryRequest,
    DbQueryResponse,
    ReExtractDocumentsRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/db", tags=["admin-db"])


async def _require_admin_access(
    x_admin_api_key: str | None = Header(None),
) -> None:
    """Accept either a valid API key or fall through to JWT superuser check."""
    if x_admin_api_key:
        if not settings.admin_api_key:
            raise HTTPException(status_code=503, detail="Admin API key not configured")
        if x_admin_api_key != settings.admin_api_key:
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
        async with AsyncSessionLocal() as db:
            columns, rows = await db_admin_repo.execute_readonly_query(db, body.sql)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return DbQueryResponse(columns=columns, rows=rows, row_count=len(rows))


@router.post("/reassign-property", response_model=BulkUpdateResponse)
async def reassign_property(
    body: BulkPropertyReassignRequest,
    _: None = Depends(_require_admin_access),
) -> BulkUpdateResponse:
    """Reassign transactions to a different property by vendor + filename pattern."""
    async with unit_of_work() as db:
        count = await db_admin_repo.bulk_update_property(
            db, str(body.organization_id),
            body.vendor, body.filename_pattern, str(body.target_property_id),
        )
    logger.info(
        "ADMIN_DB reassign_property org=%s vendor=%s pattern=%s target=%s count=%d",
        body.organization_id, body.vendor, body.filename_pattern,
        body.target_property_id, count,
    )
    return BulkUpdateResponse(updated=count)


@router.post("/fix-sub-category", response_model=BulkUpdateResponse)
async def fix_sub_category(
    body: BulkSubCategoryFixRequest,
    _: None = Depends(_require_admin_access),
) -> BulkUpdateResponse:
    """Fix utility sub_category for transactions matching vendor + description."""
    async with unit_of_work() as db:
        count = await db_admin_repo.bulk_update_sub_category(
            db, str(body.organization_id),
            body.vendor, body.description_pattern, body.new_sub_category,
        )
    logger.info(
        "ADMIN_DB fix_sub_category org=%s vendor=%s pattern=%s sub_cat=%s count=%d",
        body.organization_id, body.vendor, body.description_pattern,
        body.new_sub_category, count,
    )
    return BulkUpdateResponse(updated=count)


@router.post("/soft-delete", response_model=BulkUpdateResponse)
async def soft_delete_transactions(
    body: BulkSoftDeleteRequest,
    _: None = Depends(_require_admin_access),
) -> BulkUpdateResponse:
    """Soft-delete duplicate transactions matching criteria."""
    async with unit_of_work() as db:
        count = await db_admin_repo.bulk_soft_delete(
            db, str(body.organization_id),
            body.vendor, body.category, body.source, body.description_pattern,
        )
    logger.info(
        "ADMIN_DB soft_delete org=%s vendor=%s category=%s source=%s count=%d",
        body.organization_id, body.vendor, body.category, body.source, count,
    )
    return BulkUpdateResponse(updated=count)


@router.post("/re-extract", response_model=BulkUpdateResponse)
async def re_extract_documents(
    body: ReExtractDocumentsRequest,
    _: None = Depends(_require_admin_access),
) -> BulkUpdateResponse:
    """Queue documents for re-extraction with the current prompt."""
    async with unit_of_work() as db:
        count = await db_admin_repo.queue_documents_for_reextraction(
            db, str(body.organization_id), [str(d) for d in body.document_ids],
        )
    logger.info("ADMIN_DB re_extract org=%s doc_count=%d", body.organization_id, count)
    return BulkUpdateResponse(updated=count)
