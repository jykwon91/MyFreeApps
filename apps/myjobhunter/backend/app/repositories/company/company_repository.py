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
from datetime import datetime
from typing import Any

from platform_shared.repositories.audited_writes import lock_rows
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.company.company import Company

# Allowlist of columns that can be applied via the dynamic ``update``
# function. Per the project security rule: "Always validate field names
# against an explicit allowlist before applying dynamic updates." Tenant
# scoping (``user_id``) and server-managed columns (``id``, ``created_at``,
# ``updated_at``) are deliberately excluded.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "name",
    "primary_domain",
    "logo_url",
    "industry",
    "size_range",
    "hq_location",
    "description",
    "external_ref",
    "external_source",
    "crunchbase_id",
})


async def get_by_id(db: AsyncSession, company_id: uuid.UUID, user_id: uuid.UUID) -> Company | None:
    """Return the company iff it belongs to ``user_id``."""
    result = await db.execute(
        select(Company).where(Company.id == company_id, Company.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_by_id_for_update(
    db: AsyncSession, company_id: uuid.UUID, user_id: uuid.UUID,
) -> Company | None:
    """Return the company iff it belongs to ``user_id``, holding a row lock.

    ``FOR UPDATE`` conflicts with the ``FOR KEY SHARE`` lock Postgres takes on
    the parent row when an ``applications`` row referencing it is inserted, so
    a concurrent application create waits until this transaction ends.
    """
    result = await db.execute(
        select(Company)
        .where(Company.id == company_id, Company.user_id == user_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def list_by_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    name_search: str | None = None,
) -> list[Company]:
    """List a user's companies, ordered by name.

    Optional ``name_search``: case-insensitive substring filter on ``name``.
    Uses ``ILIKE`` so PostgreSQL can use a trigram index (GIN) if one exists.
    For a basic ASCII prefix match a B-tree on ``lower(name)`` would also
    work, but ``ILIKE`` is more useful for mid-string search without
    requiring a GIN index to be pre-existing.
    """
    stmt = select(Company).where(Company.user_id == user_id)
    if name_search is not None and name_search.strip():
        stmt = stmt.where(Company.name.icontains(name_search.strip(), autoescape=True))
    stmt = stmt.order_by(Company.name.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_by_name(
    db: AsyncSession, user_id: uuid.UUID, name: str,
) -> Company | None:
    """Return the user's company whose name equals ``name`` (case-insensitive, trimmed).

    Names are not unique per user, so when several rows match the oldest wins
    (deterministic across calls). Scoped to ``user_id``.
    """
    needle = name.strip().lower()
    result = await db.execute(
        select(Company)
        .where(Company.user_id == user_id, func.lower(func.trim(Company.name)) == needle)
        .order_by(Company.created_at.asc(), Company.id.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


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


async def update(
    db: AsyncSession,
    company: Company,
    updates: dict[str, Any],
) -> Company:
    """Apply allowlisted updates to a Company.

    Filters ``updates`` against ``_UPDATABLE_COLUMNS`` before applying — any
    keys outside the allowlist are silently dropped (defense in depth on top
    of the Pydantic schema's ``extra='forbid'``). Returns the refreshed
    ``Company``.
    """
    safe_fields = {k: v for k, v in updates.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return company

    for key, value in safe_fields.items():
        setattr(company, key, value)
    await db.flush()
    await db.refresh(company)
    return company


async def delete(db: AsyncSession, company: Company) -> None:
    """Hard-delete a Company.

    Companies use HARD delete (no ``deleted_at`` column) per the data model.
    ``company_research`` / ``research_sources`` cascade with the company.
    ``applications.company_id`` is ON DELETE RESTRICT, so callers must ensure
    the company has no applications (soft-deleted included) first.
    """
    await db.delete(company)
    await db.flush()


async def try_claim_research(
    db: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    claimed_at: datetime,
    stale_before: datetime,
) -> bool:
    """Mark the company's research run as started, unless a live claim exists.

    The company is read ``FOR UPDATE``: a concurrent claim waits on the row
    lock and then finds the fresh timestamp, so only one wins. A claim older
    than ``stale_before`` (its run died) is taken over.
    """
    companies = await lock_rows(
        db, Company,
        Company.id == company_id,
        Company.user_id == user_id,
        or_(
            Company.research_started_at.is_(None),
            Company.research_started_at < stale_before,
        ),
    )
    return await _set_research_claim(db, companies, claimed_at)


async def renew_research_claim(
    db: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    claimed_at: datetime,
    renewed_at: datetime,
) -> bool:
    """Restamp the claim taken at ``claimed_at`` with ``renewed_at``, restarting its lease.

    False when the claim is no longer this run's: it was taken over (or the
    company deleted) meanwhile.
    """
    companies = await lock_rows(
        db, Company,
        Company.id == company_id,
        Company.user_id == user_id,
        Company.research_started_at == claimed_at,
    )
    return await _set_research_claim(db, companies, renewed_at)


async def release_research_claim(
    db: AsyncSession, company_id: uuid.UUID, user_id: uuid.UUID, *, claimed_at: datetime,
) -> None:
    """Clear the claim taken at ``claimed_at``; a newer claim (a later run) is left alone."""
    companies = await lock_rows(
        db, Company,
        Company.id == company_id,
        Company.user_id == user_id,
        Company.research_started_at == claimed_at,
    )
    await _set_research_claim(db, companies, None)


async def _set_research_claim(
    db: AsyncSession, companies: list[Company], research_started_at: datetime | None,
) -> bool:
    """Set the research claim on the locked ``companies``; True if there was one.

    ``updated_at`` is kept: a claim isn't an edit to the company. Marking it
    modified writes its current value, so its ``onupdate`` doesn't fire.
    """
    for company in companies:
        company.research_started_at = research_started_at
        flag_modified(company, "updated_at")
    await db.flush()
    return bool(companies)
