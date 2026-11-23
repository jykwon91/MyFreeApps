"""Admin database query and maintenance operations.

Owns the session / transaction for each admin-db endpoint: read-only
queries run on a plain session, bulk maintenance writes run inside
``unit_of_work`` so they commit atomically. Every write is logged with an
``ADMIN_DB`` prefix so the operator has an audit trail of manual fixes. The
log names the org, target and count, never the vendor or the match patterns:
those are payee names and file names, and log lines reach Sentry.
"""
import logging

from app.core.db_admin_query_error import DbAdminQueryError
from app.core.db_admin_query_messages import UNREADABLE_RESULT_MESSAGE
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
    """Execute a read-only SQL query.

    Raises ``DbAdminQueryError`` for rejected SQL and for a result row holding
    a value the driver can't turn into Python (its ValueError quotes the value).
    """
    async with AsyncSessionLocal() as db:
        try:
            columns, rows = await db_admin_repo.execute_readonly_query(db, sql)
        except ValueError as exc:
            logger.warning("ADMIN_DB query result could not be read: %s", exc)
            raise DbAdminQueryError(UNREADABLE_RESULT_MESSAGE) from exc
    return DbQueryResponse(columns=columns, rows=rows, row_count=len(rows))


async def reassign_property(body: BulkPropertyReassignRequest) -> BulkUpdateResponse:
    async with unit_of_work() as db:
        count = await db_admin_repo.bulk_update_property(
            db, str(body.organization_id),
            body.vendor, body.filename_pattern, str(body.target_property_id),
        )
    logger.info(
        "ADMIN_DB reassign_property org=%s target=%s count=%d",
        body.organization_id, body.target_property_id, count,
    )
    return BulkUpdateResponse(updated=count)


async def fix_sub_category(body: BulkSubCategoryFixRequest) -> BulkUpdateResponse:
    async with unit_of_work() as db:
        count = await db_admin_repo.bulk_update_sub_category(
            db, str(body.organization_id),
            body.vendor, body.description_pattern, body.new_sub_category,
        )
    logger.info(
        "ADMIN_DB fix_sub_category org=%s sub_cat=%s count=%d",
        body.organization_id, body.new_sub_category, count,
    )
    return BulkUpdateResponse(updated=count)


async def soft_delete_transactions(body: BulkSoftDeleteRequest) -> BulkUpdateResponse:
    async with unit_of_work() as db:
        count = await db_admin_repo.bulk_soft_delete(
            db, str(body.organization_id),
            body.vendor, body.category, body.source, body.description_pattern,
        )
    logger.info(
        "ADMIN_DB soft_delete org=%s category=%s source=%s count=%d",
        body.organization_id, body.category, body.source, count,
    )
    return BulkUpdateResponse(updated=count)


async def queue_reextraction(body: ReExtractDocumentsRequest) -> BulkUpdateResponse:
    async with unit_of_work() as db:
        count = await db_admin_repo.queue_documents_for_reextraction(
            db, str(body.organization_id), [str(d) for d in body.document_ids],
        )
    logger.info("ADMIN_DB re_extract org=%s doc_count=%d", body.organization_id, count)
    return BulkUpdateResponse(updated=count)
