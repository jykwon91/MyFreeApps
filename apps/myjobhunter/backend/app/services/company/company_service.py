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

from app.db.violated_constraint import violated_constraint_name
from app.models.company.company import Company
from app.models.company.company_research import CompanyResearch
from app.repositories.application import application_repository
from app.repositories.company import company_repository, company_research_repository
from app.schemas.company.company_create_request import CompanyCreateRequest
from app.schemas.company.company_update_request import CompanyUpdateRequest


APPLICATIONS_COMPANY_FK_NAME = "applications_company_id_fkey"
COMPANY_USER_DOMAIN_UNIQUE_NAME = "uq_company_user_domain"
UNKNOWN_COMPANY_NAME = "Unknown company"
MAX_COMPANY_NAME_LEN = 200


class DuplicatePrimaryDomainError(ValueError):
    """Raised when ``primary_domain`` collides with the user's existing companies.

    The ``companies`` table has a UNIQUE constraint on ``(user_id, lower(primary_domain))``.
    Subclasses ``ValueError`` so the route handler can map it to HTTP 409.
    """


class CompanyHasApplicationsError(Exception):
    """Raised when deleting a company that still has applications.

    ``applications.company_id`` is ON DELETE RESTRICT (applications must keep
    their company), so such a company cannot be removed. ``application_count``
    includes soft-deleted applications, which still hold the FK.
    """

    def __init__(self, application_count: int) -> None:
        super().__init__(f"Company still has {application_count} application(s).")
        self.application_count = application_count


async def list_companies(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    name_search: str | None = None,
) -> list[Company]:
    """List a user's companies, ordered by name.

    Optional ``name_search``: case-insensitive substring filter on ``name``.
    Empty or whitespace-only search strings are treated as no filter.
    """
    return await company_repository.list_by_user(db, user_id, name_search=name_search)


async def find_or_create_by_name(
    db: AsyncSession,
    user_id: uuid.UUID,
    name: str | None,
) -> Company:
    """Return the user's company matching ``name``, creating it if missing.

    The single matcher for paths that only know a company name (job-analysis
    promote, discovery promote): case-insensitive, whitespace-trimmed exact
    match, scoped to ``user_id``. A blank name falls back to
    ``"Unknown company"``. Flushes but does not commit — the caller owns the
    transaction.
    """
    cleaned = ((name or "").strip() or UNKNOWN_COMPANY_NAME)[:MAX_COMPANY_NAME_LEN]
    existing = await company_repository.get_by_name(db, user_id, cleaned)
    if existing is not None:
        return existing
    return await company_repository.create(db, Company(user_id=user_id, name=cleaned))


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
    # ``logo_url`` is typed as ``AnyHttpUrl`` on the Pydantic schema for
    # input validation. In Pydantic v2 that's a ``Url`` wrapper object,
    # NOT a str subclass — passing it directly to SQLAlchemy / asyncpg
    # raises at parameter-bind time (HTTP 500). Coerce to plain str
    # before persistence.
    company = Company(
        user_id=user_id,
        name=request.name,
        primary_domain=request.primary_domain,
        logo_url=str(request.logo_url) if request.logo_url is not None else None,
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
        if not _is_domain_unique_violation(exc):
            raise
        raise DuplicatePrimaryDomainError(
            f"A company with primary_domain={request.primary_domain!r} already exists.",
        ) from exc
    return company


async def update_company(
    db: AsyncSession,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
    request: CompanyUpdateRequest,
) -> Company | None:
    """Apply allowlisted PATCH updates to a Company.

    Returns ``None`` if the company does not exist or belongs to a different
    user. The route handler maps ``None`` to HTTP 404 so cross-tenant probing
    yields the same response as a genuine miss.

    Raises ``DuplicatePrimaryDomainError`` if the new ``primary_domain``
    collides with another company owned by the same user.

    Commits at the end so the write survives the request lifecycle.
    """
    company = await company_repository.get_by_id(db, company_id, user_id)
    if company is None:
        return None

    updates = request.to_update_dict()
    if not updates:
        return company

    try:
        company = await company_repository.update(db, company, updates)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if not _is_domain_unique_violation(exc):
            raise
        raise DuplicatePrimaryDomainError(
            f"A company with primary_domain={updates.get('primary_domain')!r} already exists.",
        ) from exc
    return company


async def delete_company(
    db: AsyncSession,
    user_id: uuid.UUID,
    company_id: uuid.UUID,
) -> bool:
    """Hard-delete a Company scoped to ``user_id``.

    Returns ``True`` if a row was found and deleted, ``False`` if the company
    does not exist or belongs to another user.

    Raises ``CompanyHasApplicationsError`` when any application (soft-deleted
    included) still references the company. The check runs under a row lock on
    the company so a concurrently created application cannot slip in; an
    ``IntegrityError`` on the applications FK at delete time is mapped to the
    same error as a backstop.

    Commits at the end so the write survives the request lifecycle.
    """
    company = await company_repository.get_by_id_for_update(db, company_id, user_id)
    if company is None:
        return False
    application_count = await application_repository.count_for_company_including_deleted(
        db, company_id, user_id,
    )
    if application_count > 0:
        await db.rollback()
        raise CompanyHasApplicationsError(application_count)
    try:
        await company_repository.delete(db, company)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if not _is_applications_fk_violation(exc):
            raise
        raise CompanyHasApplicationsError(
            await application_repository.count_for_company_including_deleted(
                db, company_id, user_id,
            ),
        ) from exc
    return True


def _is_applications_fk_violation(exc: IntegrityError) -> bool:
    """True iff ``exc`` is the ``applications.company_id`` foreign-key violation."""
    return violated_constraint_name(exc) == APPLICATIONS_COMPANY_FK_NAME


def _is_domain_unique_violation(exc: IntegrityError) -> bool:
    """True iff ``exc`` is the per-user ``primary_domain`` uniqueness violation."""
    return violated_constraint_name(exc) == COMPANY_USER_DOMAIN_UNIQUE_NAME


async def get_company_research(
    db: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
) -> CompanyResearch | None:
    company = await company_repository.get_by_id(db, company_id, user_id)
    if company is None:
        return None
    return await company_research_repository.get_by_company_id(db, company_id, user_id)
