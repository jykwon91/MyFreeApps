import uuid
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.documents.document import Document
from app.models.transactions.reconciliation_match import ReconciliationMatch
from app.models.transactions.reconciliation_source import ReconciliationSource


async def find_by_document(
    db: AsyncSession, document_id: uuid.UUID,
) -> ReconciliationSource | None:
    result = await db.execute(
        select(ReconciliationSource).where(
            ReconciliationSource.document_id == document_id,
        )
    )
    return result.scalar_one_or_none()


async def create_source(
    db: AsyncSession, source: ReconciliationSource, *, load_relations: list[str] | None = None,
) -> ReconciliationSource:
    db.add(source)
    await db.flush()
    if load_relations:
        await db.refresh(source, attribute_names=load_relations)
    return source


async def create_match(
    db: AsyncSession, match: ReconciliationMatch
) -> ReconciliationMatch:
    db.add(match)
    await db.flush()
    return match


async def list_sources(
    db: AsyncSession, organization_id: uuid.UUID, tax_year: int
) -> Sequence[ReconciliationSource]:
    result = await db.execute(
        select(ReconciliationSource)
        .where(
            ReconciliationSource.organization_id == organization_id,
            ReconciliationSource.tax_year == tax_year,
        )
        .options(
            joinedload(ReconciliationSource.document).joinedload(Document.property)
        )
        .order_by(ReconciliationSource.created_at.desc())
    )
    return result.unique().scalars().all()


async def get_source_by_id(
    db: AsyncSession, source_id: uuid.UUID, organization_id: uuid.UUID
) -> ReconciliationSource | None:
    result = await db.execute(
        select(ReconciliationSource).where(
            ReconciliationSource.id == source_id,
            ReconciliationSource.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def get_discrepancies(
    db: AsyncSession, organization_id: uuid.UUID, tax_year: int
) -> Sequence[ReconciliationSource]:
    result = await db.execute(
        select(ReconciliationSource)
        .where(
            ReconciliationSource.organization_id == organization_id,
            ReconciliationSource.tax_year == tax_year,
            ReconciliationSource.status != "matched",
        )
        .options(
            joinedload(ReconciliationSource.document).joinedload(Document.property)
        )
        .order_by(ReconciliationSource.created_at.desc())
    )
    return result.unique().scalars().all()


async def update_matched_amount(
    db: AsyncSession, source: ReconciliationSource, new_amount: Decimal
) -> None:
    source.matched_amount = new_amount
    if new_amount == source.reported_amount:
        source.status = "matched"
    elif new_amount > Decimal("0"):
        source.status = "partial"
    else:
        source.status = "unmatched"
    await db.flush()
