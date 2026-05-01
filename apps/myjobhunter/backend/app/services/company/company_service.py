"""Company service — orchestration for the Companies domain.

Per the layered-architecture rule (apps/myjobhunter/CLAUDE.md):
"Routes → Services → Repositories; never import ORM/DB in route handlers."
Services orchestrate (load → validate → persist), repositories own queries.

Tenant isolation: every public function takes ``user_id`` and forwards it
to the repo. The repo also filters by ``user_id`` — defense in depth.

Audit: writes happen inside the request-scoped ``AsyncSession`` provided by
the route via ``Depends(get_db)``. The shared SQLAlchemy session listener
(registered in ``app.main`` lifespan via ``register_audit_listeners``) emits
``audit_logs`` rows automatically — no manual instrumentation needed.
"""
from __future__ import annotations

import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company
from app.models.company.company_research import CompanyResearch
from app.repositories.company import company_repository, company_research_repository
from app.schemas.company.company_create_request import CompanyCreateRequest


class DuplicatePrimaryDomainError(ValueError):
    """Raised when ``primary_domain`` collides with the user's existing companies.

    The ``companies`` table has a UNIQUE constraint on ``(user_id, lower(primary_domain))``.
    Subclasses ``ValueError`` so the route handler can map it to HTTP 409.
    """


async def list_companies(db: AsyncSession, user_id: uuid.UUID) -> list[Company]:
    """List a user's companies, ordered by name."""
    return await company_repository.list_by_user(db, user_id)


async def get_company(
    db: AsyncSession,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
) -> Company | None:
    """Return a company scoped to ``user_id`` or ``None``."""
    return await company_repository.get_by_id(db, company_id, user_id)


async def create_company(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: CompanyCreateRequest,
) -> Company:
    """Persist a new ``Company`` scoped to ``user_id``.

    Raises ``DuplicatePrimaryDomainError`` if the user already has a company
    with the same ``primary_domain`` (case-insensitive) — the route maps that
    to HTTP 409 so the UI can surface "company with that domain already
    exists" without round-tripping a list query first.

    Commits at the end so the write survives the request lifecycle.
    """
    company = Company(
        user_id=user_id,
        name=request.name,
        primary_domain=request.primary_domain,
        logo_url=request.logo_url,
        industry=request.industry,
        size_range=request.size_range,
        hq_location=request.hq_location,
        description=request.description,
        external_ref=request.external_ref,
        external_source=request.external_source,
        crunchbase_id=request.crunchbase_id,
    )
    try:
        company = await company_repository.create(db, company)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        # The unique index is on (user_id, lower(primary_domain)). Any other
        # IntegrityError shouldn't reach here for a single-row create with
        # only allowlisted fields, so surface it as a domain collision.
        raise DuplicatePrimaryDomainError(
            f"A company with primary_domain={request.primary_domain!r} already exists.",
        ) from exc
    return company


async def get_company_research(
    db: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
) -> CompanyResearch | None:
    company = await company_repository.get_by_id(db, company_id, user_id)
    if company is None:
        return None
    return await company_research_repository.get_by_company_id(db, company_id, user_id)
