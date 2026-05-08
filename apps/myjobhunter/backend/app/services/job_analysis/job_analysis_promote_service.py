"""Promote a JobAnalysis into the applications kanban.

Handles the ``apply_to_application`` flow: given a stored
:class:`~app.models.job_analysis.job_analysis.JobAnalysis` row, create a
corresponding :class:`~app.models.application.application.Application` row
(and an initial ``applied`` event), link the two rows, and commit.

Design notes
============

- Idempotent: if ``analysis.applied_application_id`` is already set and the
  referenced application still exists, return it without creating a duplicate.
- Company lookup mirrors the AddApplicationDialog's behaviour: case-insensitive
  name match first, create if missing.
- Salary / remote-type normalisation helpers are imported from the sibling
  ``job_analysis_service`` module (the shared canonical source) to avoid
  duplicating those small utilities.

Tenant isolation
================
``user_id`` is threaded through every repository call. The repository layer
also filters by ``user_id`` (defense in depth).
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.repositories.application import application_event_repository, application_repository
from app.repositories.company import company_repository
from app.repositories.job_analysis import job_analysis_repository
from app.services.job_analysis._job_analysis_utils import (
    _map_salary_period,
    _safe_float,
    _safe_remote_type,
)


async def apply_to_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    analysis_id: uuid.UUID,
) -> Application | None:
    """Create an Application from a stored analysis.

    Looks up or creates the Company by name (using the same
    ``primary_domain``-or-``name`` heuristic the AddApplicationDialog
    uses), creates the Application with the extracted role title +
    salary + location + remote_type fields, logs an initial
    ``applied`` event, sets ``analysis.applied_application_id``, and
    commits.

    Returns ``None`` if the analysis doesn't exist or belongs to
    another user. Returns the created Application otherwise.

    Idempotency: if ``analysis.applied_application_id`` is already set,
    returns the existing application without creating a duplicate.
    """
    analysis = await job_analysis_repository.get_by_id(db, analysis_id, user_id)
    if analysis is None:
        return None

    if analysis.applied_application_id is not None:
        existing = await application_repository.get_by_id(
            db, analysis.applied_application_id, user_id,
        )
        if existing is not None:
            return existing
        # The previous link points at a deleted/missing app — fall
        # through and create a fresh one.

    extracted = analysis.extracted or {}
    company_name = (extracted.get("company") or "Unknown company").strip() or "Unknown company"
    role_title = (extracted.get("title") or "Untitled role").strip() or "Untitled role"

    # Find-or-create the company. Match by case-insensitive name first
    # (cheap, mirrors the dialog's behavior), fall back to creating a
    # fresh row.
    company = await _find_or_create_company(
        db, user_id=user_id, name=company_name,
    )

    application = Application(
        user_id=user_id,
        company_id=company.id,
        role_title=role_title[:200],
        url=analysis.source_url,
        jd_text=analysis.jd_text,
        location=(extracted.get("location") or None),
        remote_type=_safe_remote_type(extracted.get("remote_type")),
        posted_salary_min=_safe_float(extracted.get("posted_salary_min")),
        posted_salary_max=_safe_float(extracted.get("posted_salary_max")),
        posted_salary_currency=(
            (extracted.get("posted_salary_currency") or "USD")[:3].upper()
        ),
        posted_salary_period=_map_salary_period(extracted.get("posted_salary_period")),
        notes=(analysis.verdict_summary or None),
    )
    application = await application_repository.create(db, application)

    # Mirror application_service.create_application's auto-event so
    # latest_status is never None after this path.
    initial_event = ApplicationEvent(
        user_id=user_id,
        application_id=application.id,
        event_type="applied",
        # No applied_at on JobAnalysis — use the analysis creation time.
        occurred_at=analysis.created_at,
        source="system",
    )
    await application_event_repository.create(db, initial_event)

    await job_analysis_repository.update(
        db, analysis, {"applied_application_id": application.id},
    )

    await db.commit()
    return application


async def _find_or_create_company(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    name: str,
) -> Any:
    """Find a company by case-insensitive name, or create one."""
    from app.models.company.company import Company

    matches = await company_repository.list_by_user(
        db, user_id, name_search=name,
    )
    needle = name.strip().lower()
    for c in matches:
        if c.name.strip().lower() == needle:
            return c
    fresh = Company(user_id=user_id, name=name[:200])
    return await company_repository.create(db, fresh)
