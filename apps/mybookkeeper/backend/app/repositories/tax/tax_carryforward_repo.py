"""Repository for TaxCarryforward queries."""
import uuid
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tax.tax_carryforward import TaxCarryforward


async def get_available_for_year(
    db: AsyncSession,
    organization_id: uuid.UUID,
    to_year: int,
    carryforward_type: str,
) -> list[TaxCarryforward]:
    """Get unused carryforwards available for a given tax year and type."""
    stmt = (
        select(TaxCarryforward)
        .where(
            TaxCarryforward.organization_id == organization_id,
            TaxCarryforward.to_year == to_year,
            TaxCarryforward.carryforward_type == carryforward_type,
            TaxCarryforward.remaining > Decimal("0"),
        )
        .order_by(TaxCarryforward.from_year)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def sum_remaining_for_year(
    db: AsyncSession,
    organization_id: uuid.UUID,
    to_year: int,
    carryforward_type: str,
) -> Decimal:
    """Sum remaining carryforward amounts for a given year and type."""
    stmt = (
        select(func.coalesce(func.sum(TaxCarryforward.remaining), Decimal("0")))
        .where(
            TaxCarryforward.organization_id == organization_id,
            TaxCarryforward.to_year == to_year,
            TaxCarryforward.carryforward_type == carryforward_type,
            TaxCarryforward.remaining > Decimal("0"),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one()
