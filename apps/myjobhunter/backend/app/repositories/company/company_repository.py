"""Company repository — Phase 1 stub."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company


async def get_by_id(db: AsyncSession, company_id: uuid.UUID, user_id: uuid.UUID) -> Company | None:
    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Company]:
    result = await db.execute(
        select(Company).where(Company.user_id == user_id)
    )
    return list(result.scalars().all())
