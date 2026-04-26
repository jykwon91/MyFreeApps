"""Repository for EstimatedTaxPayment queries."""
import uuid
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tax.estimated_tax_payment import EstimatedTaxPayment


async def list_for_year(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    jurisdiction: str = "federal",
) -> list[EstimatedTaxPayment]:
    """Get all estimated tax payments for a given year and jurisdiction."""
    stmt = (
        select(EstimatedTaxPayment)
        .where(
            EstimatedTaxPayment.organization_id == organization_id,
            EstimatedTaxPayment.tax_year == tax_year,
            EstimatedTaxPayment.jurisdiction == jurisdiction,
        )
        .order_by(EstimatedTaxPayment.quarter)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def sum_for_year(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    jurisdiction: str = "federal",
) -> Decimal:
    """Sum all estimated payments for a given year and jurisdiction."""
    stmt = (
        select(func.coalesce(func.sum(EstimatedTaxPayment.amount), Decimal("0")))
        .where(
            EstimatedTaxPayment.organization_id == organization_id,
            EstimatedTaxPayment.tax_year == tax_year,
            EstimatedTaxPayment.jurisdiction == jurisdiction,
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def count_for_year(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    jurisdiction: str = "federal",
) -> int:
    """Count estimated payments for a given year and jurisdiction."""
    stmt = (
        select(func.count())
        .select_from(EstimatedTaxPayment)
        .where(
            EstimatedTaxPayment.organization_id == organization_id,
            EstimatedTaxPayment.tax_year == tax_year,
            EstimatedTaxPayment.jurisdiction == jurisdiction,
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one()
