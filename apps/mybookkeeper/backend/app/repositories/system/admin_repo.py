"""MBK-specific admin queries.

Generic platform-level admin queries (user counts, set_superuser) live
in ``platform_shared.repositories.admin_user_repo`` so MJH and any
future apps share them without duplication. This module owns only the
queries that depend on MBK's domain tables (organizations,
transactions, documents).
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.transactions.transaction import Transaction
from app.models.user.user import User


async def count_organizations(db: AsyncSession) -> int:
    result = await db.execute(select(func.count(Organization.id)))
    return result.scalar_one()


async def count_transactions(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(Transaction.id)).where(Transaction.deleted_at.is_(None))
    )
    return result.scalar_one()


async def count_documents(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(Document.id)).where(Document.deleted_at.is_(None))
    )
    return result.scalar_one()


async def list_orgs_with_counts(db: AsyncSession) -> list[dict]:
    """List all organizations with member count, transaction count, and owner email."""
    member_count = (
        select(
            OrganizationMember.organization_id,
            func.count(OrganizationMember.id).label("member_count"),
        )
        .group_by(OrganizationMember.organization_id)
        .subquery()
    )

    txn_count = (
        select(
            Transaction.organization_id,
            func.count(Transaction.id).label("transaction_count"),
        )
        .where(Transaction.deleted_at.is_(None))
        .group_by(Transaction.organization_id)
        .subquery()
    )

    stmt = (
        select(
            Organization.id,
            Organization.name,
            Organization.created_by,
            Organization.created_at,
            func.coalesce(member_count.c.member_count, 0).label("member_count"),
            func.coalesce(txn_count.c.transaction_count, 0).label("transaction_count"),
        )
        .outerjoin(member_count, Organization.id == member_count.c.organization_id)
        .outerjoin(txn_count, Organization.id == txn_count.c.organization_id)
        .order_by(Organization.created_at.desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    # Batch-fetch creator emails (separate query avoids cross-dialect UUID join issues)
    creator_ids = list({row.created_by for row in rows})
    email_map: dict[uuid.UUID, str] = {}
    if creator_ids:
        email_result = await db.execute(
            select(User.id, User.email).where(User.id.in_(creator_ids))
        )
        email_map = {uid: email for uid, email in email_result.all()}

    return [
        {
            "id": row.id,
            "name": row.name,
            "created_by": row.created_by,
            "created_at": row.created_at,
            "owner_email": email_map.get(row.created_by),
            "member_count": row.member_count,
            "transaction_count": row.transaction_count,
        }
        for row in rows
    ]


