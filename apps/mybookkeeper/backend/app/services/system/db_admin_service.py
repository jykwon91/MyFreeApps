"""Admin database query and maintenance operations.

Owns the session / transaction for each admin-db endpoint: read-only
queries run on a plain session, bulk maintenance writes run inside
``unit_of_work`` so they commit atomically. Every write is logged with an
``ADMIN_DB`` prefix so the operator has an audit trail of manual fixes.
"""
import logging

from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import db_admin_repo
from app.schemas.system.db_admin import (
    BulkPropertyReassignRequest,
    BulkSoftDeleteRequest,
    BulkSubCategoryFixRequest,
    BulkUpdateResponse,
    DbQueryResponse,
    ReExtractDocumentsRequest,
)

logger = logging.getLogger(__name__)


async def run_readonly_query(sql: str) -> DbQueryResponse:
    """Execute a read-only SQL query. Raises ValueError for rejected SQL."""
    async with AsyncSessionLocal() as db:
        columns, rows = await db_admin_repo.execute_readonly_query(db, sql)
    return DbQueryResponse(columns=columns, rows=rows, row_count=len(rows))


async def reassign_property(body: BulkPropertyReassignRequest) -> BulkUpdateResponse:
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


async def fix_sub_category(body: BulkSubCategoryFixRequest) -> BulkUpdateResponse:
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


async def soft_delete_transactions(body: BulkSoftDeleteRequest) -> BulkUpdateResponse:
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


async def queue_reextraction(body: ReExtractDocumentsRequest) -> BulkUpdateResponse:
    async with unit_of_work() as db:
        count = await db_admin_repo.queue_documents_for_reextraction(
            db, str(body.organization_id), [str(d) for d in body.document_ids],
        )
    logger.info("ADMIN_DB re_extract org=%s doc_count=%d", body.organization_id, count)
    return BulkUpdateResponse(updated=count)
