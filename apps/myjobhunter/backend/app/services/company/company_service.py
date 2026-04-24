"""Company service — Phase 1 stub.

Owns company + company_research + research_source.
Full CRUD implemented in Phase 2.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company
from app.models.company.company_research import CompanyResearch
from app.repositories.company import company_repository, company_research_repository


async def list_companies(db: AsyncSession, user_id: uuid.UUID) -> list[Company]:
    return await company_repository.list_by_user(db, user_id)


async def get_company_research(db: AsyncSession, company_id: uuid.UUID, user_id: uuid.UUID) -> CompanyResearch | None:
    company = await company_repository.get_by_id(db, company_id, user_id)
    if company is None:
        return None
    return await company_research_repository.get_by_company_id(db, company_id, user_id)
