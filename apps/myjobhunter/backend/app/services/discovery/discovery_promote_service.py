"""Promote a discovered job into the applications kanban.

Mirrors ``job_analysis_service.apply_to_application`` but starts from
a ``DiscoveredJob`` row (which already has structured fields from the
source API) rather than a JD-analysis row. Idempotent: a second
promote call for the same discovered_job returns the existing
application.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company
from app.repositories.application import (
    application_event_repository,
    application_repository,
)
from app.repositories.company import company_repository
from app.repositories.discovery import discovery_repository

logger = logging.getLogger(__name__)


# JSearch's ``job_publisher`` strings normalized to the application source
# enum on application_events.source. Values not in this map fall to
# 'direct' (user followed an external apply link to apply directly).
_PUBLISHER_TO_SOURCE: dict[str, str] = {
    "linkedin": "linkedin",
    "indeed": "indeed",
    "ziprecruiter": "ziprecruiter",
    "greenhouse": "greenhouse",
    "lever": "lever",
}


_VALID_REMOTE_TYPES = frozenset({"remote", "hybrid", "onsite"})


class DiscoveryPromoteError(RuntimeError):
    """Discovered job not found / not owned by caller — HTTP 404."""


async def promote_discovered_job(
    db: AsyncSession,
    user_id: uuid.UUID,
    discovered_job_id: uuid.UUID,
) -> Application:
    """Create an Application from a DiscoveredJob. Idempotent.

    If ``promoted_application_id`` is already set on the discovered_job
    AND the referenced application still exists, return that. Otherwise
    create a fresh Application + initial ``applied`` event, mark the
    discovered_job as promoted, commit.
    """
    job = await discovery_repository.get_discovered(db, discovered_job_id, user_id)
    if job is None:
        raise DiscoveryPromoteError(
            f"discovered_job {discovered_job_id} not found",
        )

    if job.promoted_application_id is not None:
        existing = await application_repository.get_by_id(
            db, job.promoted_application_id, user_id,
        )
        if existing is not None:
            return existing
        # The previous link points at a deleted/missing app. Fall
        # through and create a fresh one.

    company = await _find_or_create_company(
        db, user_id=user_id, name=job.company_name,
    )

    publisher_norm = (job.source_publisher or "").lower()
    application_source = _PUBLISHER_TO_SOURCE.get(publisher_norm, "direct")

    remote_type = (
        job.remote_type if job.remote_type in _VALID_REMOTE_TYPES else "unknown"
    )

    application = Application(
        user_id=user_id,
        company_id=company.id,
        role_title=(job.title or "Untitled role")[:200],
        url=job.source_url,
        jd_text=job.description,
        location=job.location,
        remote_type=remote_type,
        posted_salary_min=float(job.salary_min) if job.salary_min is not None else None,
        posted_salary_max=float(job.salary_max) if job.salary_max is not None else None,
        posted_salary_currency=(job.salary_currency or "USD")[:3].upper(),
        posted_salary_period=job.salary_period,
        source=application_source,
        notes=job.score_reason,
    )
    application = await application_repository.create(db, application)

    initial_event = ApplicationEvent(
        user_id=user_id,
        application_id=application.id,
        event_type="applied",
        occurred_at=datetime.now(timezone.utc),
        # 'discovery' was added to the chk_appevent_source enum in
        # migration disco260507. Records provenance for the kanban.
        source="discovery",
    )
    await application_event_repository.create(db, initial_event)

    job.promoted_application_id = application.id
    job.promoted_at = datetime.now(timezone.utc)
    # Promoted rows are no longer in the inbox; if the operator
    # had also saved the row, clear that flag for consistency.
    job.saved_at = None
    await db.flush()

    await db.commit()
    await db.refresh(application)
    logger.info(
        "discovery promote: user=%s discovered_job=%s -> application=%s",
        user_id, discovered_job_id, application.id,
    )
    return application


async def _find_or_create_company(
    db: AsyncSession, *, user_id: uuid.UUID, name: str,
) -> Company:
    """Find a company by case-insensitive name, or create one."""
    cleaned = (name or "Unknown company").strip() or "Unknown company"
    matches = await company_repository.list_by_user(
        db, user_id, name_search=cleaned,
    )
    needle = cleaned.lower()
    for c in matches:
        if c.name.strip().lower() == needle:
            return c
    fresh = Company(user_id=user_id, name=cleaned[:200])
    return await company_repository.create(db, fresh)
