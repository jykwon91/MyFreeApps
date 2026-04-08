import logging
import uuid
from collections.abc import Sequence

from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.user.user import Role, User
from app.repositories import admin_repo, document_repo, extraction_repo, transaction_repo, user_repo
from app.schemas.system.admin import AdminOrgRead, CleanReExtractResponse, PlatformStats

logger = logging.getLogger(__name__)


async def list_users() -> Sequence[User]:
    async with AsyncSessionLocal() as db:
        return await user_repo.list_all(db)


async def update_user_role(
    user_id: uuid.UUID,
    role: Role,
    admin: User,
) -> User:
    if user_id == admin.id:
        raise ValueError("Cannot change your own role")

    async with unit_of_work() as db:
        target = await user_repo.get_by_id(db, user_id)
        if not target:
            raise LookupError("User not found")

        old_role = target.role
        result = await user_repo.update_role(db, target, role)
        logger.info(
            "ADMIN_ACTION role_change admin=%s target=%s old=%s new=%s",
            admin.id, target.id, old_role.value, role.value,
        )
        return result


async def deactivate_user(
    user_id: uuid.UUID,
    admin: User,
) -> User:
    if user_id == admin.id:
        raise ValueError("Cannot deactivate yourself")

    async with unit_of_work() as db:
        target = await user_repo.get_by_id(db, user_id)
        if not target:
            raise LookupError("User not found")

        result = await user_repo.set_active(db, target, is_active=False)
        logger.info("ADMIN_ACTION deactivate admin=%s target=%s", admin.id, target.id)
        return result


async def activate_user(
    user_id: uuid.UUID,
    admin: User,
) -> User:
    if user_id == admin.id:
        raise ValueError("Cannot activate yourself")

    async with unit_of_work() as db:
        target = await user_repo.get_by_id(db, user_id)
        if not target:
            raise LookupError("User not found")

        result = await user_repo.set_active(db, target, is_active=True)
        logger.info("ADMIN_ACTION activate admin=%s target=%s", admin.id, target.id)
        return result


async def get_platform_stats() -> PlatformStats:
    async with AsyncSessionLocal() as db:
        total, active, inactive = await admin_repo.count_users(db)
        orgs = await admin_repo.count_organizations(db)
        txns = await admin_repo.count_transactions(db)
        docs = await admin_repo.count_documents(db)
        return PlatformStats(
            total_users=total,
            active_users=active,
            inactive_users=inactive,
            total_organizations=orgs,
            total_transactions=txns,
            total_documents=docs,
        )


async def toggle_superuser(user_id: uuid.UUID, admin: User) -> User:
    if not admin.is_superuser:
        raise PermissionError("Only superusers can toggle superuser status")
    if user_id == admin.id:
        raise ValueError("Cannot change your own superuser status")

    async with unit_of_work() as db:
        target = await user_repo.get_by_id(db, user_id)
        if not target:
            raise LookupError("User not found")

        new_status = not target.is_superuser
        result = await admin_repo.set_superuser(db, target, is_superuser=new_status)
        logger.info(
            "ADMIN_ACTION superuser_toggle admin=%s target=%s is_superuser=%s",
            admin.id, target.id, new_status,
        )
        return result


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
