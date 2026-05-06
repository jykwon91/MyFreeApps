"""MBK-specific admin operations.

Generic admin user-management (list_users, role/active/superuser
toggles, user counts) lives in
``platform_shared.services.admin_user_service``. This module owns only
the MBK-domain operations: clean re-extract, list orgs with member /
transaction counts, and the composite ``get_platform_stats`` that
extends the shared user-stats with MBK's per-domain counts.
"""
import logging
import uuid

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.user.user import User
from app.repositories import admin_repo, document_repo, extraction_repo, transaction_repo
from app.schemas.system.admin import AdminOrgRead, CleanReExtractResponse, PlatformStats
from app.services.system.admin_user_service_factory import shared_admin_user_service

logger = logging.getLogger(__name__)


async def get_platform_stats() -> PlatformStats:
    """User counts (from shared) + MBK-specific org / txn / doc counts."""
    user_stats = await shared_admin_user_service.get_user_stats()
    async with AsyncSessionLocal() as db:
        orgs = await admin_repo.count_organizations(db)
        txns = await admin_repo.count_transactions(db)
        docs = await admin_repo.count_documents(db)
    return PlatformStats(
        total_users=user_stats.total_users,
        active_users=user_stats.active_users,
        inactive_users=user_stats.inactive_users,
        total_organizations=orgs,
        total_transactions=txns,
        total_documents=docs,
    )


async def clean_re_extract(
    organization_id: uuid.UUID,
    document_type: str,
    tax_year: int | None,
    admin: User,
) -> CleanReExtractResponse:
    """Delete transactions/extractions for a document type, reset documents for re-extraction."""
    async with unit_of_work() as db:
        docs = await document_repo.list_by_document_type(db, organization_id, document_type)
        if not docs:
            return CleanReExtractResponse(
                documents_found=0, transactions_deleted=0,
                extractions_deleted=0, documents_reset=0,
            )

        doc_ids = [d.id for d in docs]

        extraction_ids, extractions_deleted = await extraction_repo.delete_by_document_ids(db, doc_ids)

        transactions_deleted = 0
        if extraction_ids:
            transactions_deleted = await transaction_repo.delete_by_extraction_ids(
                db, extraction_ids, organization_id, tax_year=tax_year,
            )

        documents_reset = await document_repo.reset_to_processing(db, doc_ids, organization_id)

    logger.info(
        "ADMIN_ACTION clean_re_extract admin=%s org=%s doc_type=%s tax_year=%s docs=%d txns=%d extractions=%d",
        admin.id, organization_id, document_type, tax_year,
        len(docs), transactions_deleted, extractions_deleted,
    )
    return CleanReExtractResponse(
        documents_found=len(docs),
        transactions_deleted=transactions_deleted,
        extractions_deleted=extractions_deleted,
        documents_reset=documents_reset,
    )


async def list_all_orgs() -> list[AdminOrgRead]:
    async with AsyncSessionLocal() as db:
        rows = await admin_repo.list_orgs_with_counts(db)
        return [
            AdminOrgRead(
                id=row["id"],
                name=row["name"],
                created_by=row["created_by"],
                owner_email=row["owner_email"],
                created_at=row["created_at"],
                member_count=row["member_count"],
                transaction_count=row["transaction_count"],
            )
            for row in rows
        ]
