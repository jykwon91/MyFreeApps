"""CompanyResearch repository — Phase 1 stub."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company_research import CompanyResearch


async def get_by_id(db: AsyncSession, research_id: uuid.UUID, user_id: uuid.UUID) -> CompanyResearch | None:
    result = await db.execute(
        select(CompanyResearch).where(CompanyResearch.id == research_id, CompanyResearch.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_by_company_id(db: AsyncSession, company_id: uuid.UUID, user_id: uuid.UUID) -> CompanyResearch | None:
    result = await db.execute(
        select(CompanyResearch).where(
            CompanyResearch.company_id == company_id,
            CompanyResearch.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[CompanyResearch]:
    result = await db.execute(
        select(CompanyResearch).where(CompanyResearch.user_id == user_id)
    )
    return list(result.scalars().all())
