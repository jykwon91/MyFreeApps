"""Company service — orchestration for the Companies domain.

Per the layered-architecture rule (apps/myjobhunter/CLAUDE.md):
"Routes → Services → Repositories; never import ORM/DB in route handlers."
Services orchestrate (load → validate → persist), repositories own queries.

Tenant isolation: every public function takes ``user_id`` and forwards it
to the repo. The repo also filters by ``user_id`` — defense in depth.

Audit: each write runs in its own ``unit_of_work`` (commit on clean exit,
rollback on error). The shared SQLAlchemy session listener
(registered in ``app.main`` lifespan via ``register_audit_listeners``) emits
``audit_logs`` rows automatically — no manual instrumentation needed.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable
from functools import partial

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.services.stored_file_removal import remove_stored_files

from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.db.violated_constraint import violated_constraint_name
from app.models.company.company import Company
from app.models.company.company_research import CompanyResearch
from app.repositories.application import application_repository
from app.repositories.company import company_repository, company_research_repository
from app.repositories.discovery import discovery_promotion_repository
from app.repositories.documents import document_repo
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
    counts live applications only; soft-deleted ones are purged with the company.
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
    user_id: uuid.UUID,
    request: CompanyCreateRequest,
) -> Company:
    """Persist a new ``Company`` scoped to ``user_id``.

    Raises ``DuplicatePrimaryDomainError`` if the user already has a company
    with the same ``primary_domain`` (case-insensitive) — the route maps that
    to HTTP 409 so the UI can surface "company with that domain already
    exists" without round-tripping a list query first.

    Commits in its own ``unit_of_work``.
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
        async with unit_of_work() as db:
            company = await company_repository.create(db, company)
    except IntegrityError as exc:
        if not _is_domain_unique_violation(exc):
            raise
        raise DuplicatePrimaryDomainError(
            f"A company with primary_domain={request.primary_domain!r} already exists.",
        ) from exc
    return company


async def update_company(
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

    Commits in its own ``unit_of_work``.
    """
    updates = request.to_update_dict()
    try:
        async with unit_of_work() as db:
            company = await company_repository.get_by_id(db, company_id, user_id)
            if company is None or not updates:
                return company
            company = await company_repository.update(db, company, updates)
    except IntegrityError as exc:
        if not _is_domain_unique_violation(exc):
            raise
        raise DuplicatePrimaryDomainError(
            f"A company with primary_domain={updates.get('primary_domain')!r} already exists.",
        ) from exc
    return company


async def delete_company(
    user_id: uuid.UUID,
    company_id: uuid.UUID,
) -> Callable[[], None] | None:
    """Hard-delete a Company scoped to ``user_id``.

    Returns ``None`` if the company does not exist or belongs to another user.
    Otherwise returns what to run once the deletion has committed: removing
    stored files can't be undone by a rollback, so it can't happen before then.

    Raises ``CompanyHasApplicationsError`` when a live application still
    references the company. Soft-deleted applications don't block: nothing in
    the app can restore or purge them, so they are permanently removed with the
    company, along with their events, contacts and documents (and the stored
    files of those documents). The count runs under a row lock on the company
    so a concurrently created application cannot slip in; an ``IntegrityError``
    on the applications FK at delete time is mapped to the same error as a
    backstop.

    Commits in its own ``unit_of_work``.
    """
    try:
        async with unit_of_work() as db:
            company = await company_repository.get_by_id_for_update(db, company_id, user_id)
            if company is None:
                return None
            live_count = await application_repository.count_live_for_company(db, company_id, user_id)
            if live_count > 0:
                raise CompanyHasApplicationsError(live_count)
            storage_keys = await _purge_soft_deleted_applications(db, company_id, user_id)
            await company_repository.delete(db, company)
    except IntegrityError as exc:
        if not _is_applications_fk_violation(exc):
            raise
        async with unit_of_work() as db:
            live_count = await application_repository.count_live_for_company(db, company_id, user_id)
        raise CompanyHasApplicationsError(live_count) from exc
    return partial(remove_stored_files, get_storage, storage_keys)


async def _purge_soft_deleted_applications(
    db: AsyncSession, company_id: uuid.UUID, user_id: uuid.UUID,
) -> list[str]:
    """Hard-delete the company's soft-deleted applications; return their stored-file keys.

    A discovered posting promoted to one of them goes back to Discover, the same
    as when the application was deleted.
    """
    application_ids = await application_repository.list_soft_deleted_ids_for_company(
        db, company_id, user_id,
    )
    if not application_ids:
        return []
    storage_keys = await document_repo.list_storage_keys_for_applications(db, application_ids, user_id)
    for application_id in application_ids:
        await discovery_promotion_repository.clear_promotion_links(db, user_id, application_id)
    await application_repository.delete_by_ids(db, application_ids, user_id)
    return storage_keys


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
