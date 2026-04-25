import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tax.cost_basis_lot import CostBasisLot


async def create(db: AsyncSession, lot: CostBasisLot) -> CostBasisLot:
    db.add(lot)
    await db.flush()
    await db.refresh(lot)
    return lot


async def list_for_org_year(
    db: AsyncSession, organization_id: uuid.UUID, tax_year: int,
) -> list[CostBasisLot]:
    result = await db.execute(
        select(CostBasisLot)
        .where(
            CostBasisLot.organization_id == organization_id,
            CostBasisLot.tax_year == tax_year,
        )
        .order_by(CostBasisLot.sale_date.desc().nulls_last())
    )
    return list(result.scalars().all())
