"""Repository for ``companies`` — owns every query against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. Every public function takes
``user_id`` and filters by it — tenant scoping is mandatory per the
"every query filters by user_id" rule in CLAUDE.md.

Companies use HARD delete (no ``deleted_at`` column) per the data model
documented in CLAUDE.md.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company


async def get_by_id(db: AsyncSession, company_id: uuid.UUID, user_id: uuid.UUID) -> Company | None:
    """Return the company iff it belongs to ``user_id``."""
    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Company]:
    """List a user's companies, ordered by name."""
    result = await db.execute(
        select(Company).where(Company.user_id == user_id).order_by(Company.name.asc())
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, company: Company) -> Company:
    """Persist a new ``Company``.

    The caller (service layer) is responsible for setting ``user_id``
    from the validated request context. The repo intentionally does not
    accept loose kwargs — passing a fully-constructed ORM instance keeps
    the field-validation surface in one place (the schema + service).
    """
    db.add(company)
    await db.flush()
    await db.refresh(company)
    return company
