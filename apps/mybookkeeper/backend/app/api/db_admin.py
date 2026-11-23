"""Admin-only database query and maintenance endpoints.

These endpoints allow the operator to run read-only SQL queries and
perform common data maintenance operations (property reassignment,
sub_category fixes, duplicate cleanup, re-extraction).

Gated solely by the static X-Admin-Api-Key header (for MCP/CLI tooling
without 2FA); no user role or JWT is involved.
"""
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL

from app.core.config import settings
from app.core.db_admin_query_error import DbAdminQueryError
from app.core.rate_limit import admin_db_key_failure_limiter
from app.core.request_utils import get_client_ip
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/db", tags=["admin-db"])


async def _require_admin_access(
    request: Request,
    x_admin_api_key: str | None = Header(None),
) -> None:
    """Require a valid static admin API key (compared in constant time).

    Wrong-key attempts are logged (client IP and path, never the key) and
    counted per IP; once an IP is over the limit it gets 429 before any key
    is compared, so the key cannot be guessed at speed.
    """
    client_ip = get_client_ip(request)
    retry_after = admin_db_key_failure_limiter.retry_after_seconds(client_ip)
    if retry_after is not None:
        logger.warning(
            "Admin DB key attempt blocked by rate limit: ip=%s path=%s",
            client_ip, request.url.path,
        )
        raise HTTPException(
            status_code=429,
            detail=RATE_LIMIT_GENERIC_DETAIL,
            headers={"Retry-After": str(retry_after)},
        )
    if not x_admin_api_key:
        logger.warning(
            "Admin DB request without API key: ip=%s path=%s", client_ip, request.url.path,
        )
        raise HTTPException(status_code=401, detail="X-Admin-Api-Key header required")
    if not settings.admin_api_key:
        raise HTTPException(status_code=503, detail="Admin API key not configured")
    if not admin_api_key_matches(x_admin_api_key, settings.admin_api_key):
        logger.warning(
            "Admin DB API key rejected: ip=%s path=%s", client_ip, request.url.path,
        )
        admin_db_key_failure_limiter.check(client_ip)
        raise HTTPException(status_code=403, detail="Invalid admin API key")


@router.post("/query", response_model=DbQueryResponse)
async def run_query(
    body: DbQueryRequest,
    _: None = Depends(_require_admin_access),
) -> DbQueryResponse:
    """Execute a read-only SQL query. SELECT only, max 200 rows."""
    try:
        return await db_admin_service.run_readonly_query(body.sql)
    except DbAdminQueryError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


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
