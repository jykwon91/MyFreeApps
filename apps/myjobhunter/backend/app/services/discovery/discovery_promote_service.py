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

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import PUBLISHER_TO_SOURCE
from app.db.violated_constraint import violated_constraint_name
from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.discovery.discovered_job import DiscoveredJob
from app.repositories.application import (
    application_event_repository,
    application_repository,
)
from app.repositories.discovery import (
    discovery_duplicate_repository,
    discovery_repository,
)
from app.services.company import company_service

logger = logging.getLogger(__name__)


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

    A dismissed posting whose twin (same content, another source) holds the
    content-hash slot is that same posting: promote the twin (listed or
    expired — the user asked for the application), and link this row to the
    same application while it keeps its dismissal, since clearing it would
    collide with the twin.

    A fetch can insert that twin after the check, so the write violates the
    content-hash index: roll back and promote once more, which now finds the
    committed twin and promotes it. That attempt clears no dismissal, so it
    can't collide again. Any other integrity error is re-raised.
    """
    try:
        return await _promote_once(db, user_id, discovered_job_id)
    except IntegrityError as exc:
        await db.rollback()
        if violated_constraint_name(exc) != discovery_duplicate_repository.TWIN_INDEX_NAME:
            raise
        logger.info(
            "promote: twin arrived mid-promote user=%s job=%s; promoting the twin",
            user_id, discovered_job_id,
        )
    return await _promote_once(db, user_id, discovered_job_id)


async def _promote_once(
    db: AsyncSession,
    user_id: uuid.UUID,
    discovered_job_id: uuid.UUID,
) -> Application:
    """One attempt at ``promote_discovered_job``, committing on success."""
    job = await discovery_repository.get_discovered(
        db, discovered_job_id, user_id, for_update=True,
    )
    if job is None:
        raise DiscoveryPromoteError(
            f"discovered_job {discovered_job_id} not found",
        )

    existing = await _linked_application(db, job, user_id)
    if existing is not None:
        return existing
    # A dismissed posting whose twin holds the content-hash slot: the twin is
    # the same posting, and the one Discover lists. Promote it.
    twin = await discovery_duplicate_repository.get_active_twin(db, job)
    target = twin if twin is not None else job

    application = await _linked_application(db, target, user_id) if twin is not None else None
    if application is None:
        application = await _create_application(db, user_id, target)
        _link(target, application)
        # A promoted row is an application, in no Discover view: clear Saved,
        # and a dismissal made on another device (as Save does), so it is never
        # left promoted AND dismissed.
        target.saved_at = None
        target.dismissed_at = None
        target.dismissed_reason = None
    if twin is not None:
        # This row keeps its dismissal (clearing it would collide with the
        # twin), but it is applied too: it leaves the Dismissed view, and a
        # repeat Apply on it returns the same application.
        _link(job, application)
    await db.flush()

    await db.commit()
    await db.refresh(application)
    logger.info(
        "discovery promote: user=%s discovered_job=%s (row %s) -> application=%s",
        user_id, discovered_job_id, target.id, application.id,
    )
    return application


async def _linked_application(
    db: AsyncSession, job: DiscoveredJob, user_id: uuid.UUID,
) -> Application | None:
    """The application ``job`` is linked to, if any.

    Deleting an application clears the link (``discovery_promotion_repository``),
    so a link to a missing one shouldn't exist; if one does, it's treated as
    no link and Promote makes a fresh application.
    """
    if job.promoted_application_id is None:
        return None
    return await application_repository.get_by_id(db, job.promoted_application_id, user_id)


def _link(job: DiscoveredJob, application: Application) -> None:
    job.promoted_application_id = application.id
    job.promoted_at = datetime.now(timezone.utc)


async def _create_application(
    db: AsyncSession, user_id: uuid.UUID, job: DiscoveredJob,
) -> Application:
    """A new Application from ``job``'s fields, with its initial ``applied`` event (flushed)."""
    company = await company_service.find_or_create_by_name(
        db, user_id, job.company_name,
    )

    publisher_norm = (job.source_publisher or "").lower()
    application_source = PUBLISHER_TO_SOURCE.get(publisher_norm, "direct")

    remote_type = (
        job.remote_type if job.remote_type in _VALID_REMOTE_TYPES else "unknown"
    )

    raw_title = job.title or ""
    if not raw_title:
        logger.debug(
            "promote: empty title fallback user=%s job=%s", user_id, job.id,
        )
    elif len(raw_title) > 200:
        logger.info(
            "promote: title truncated user=%s job=%s len=%d",
            user_id, job.id, len(raw_title),
        )
    role_title = (raw_title or "Untitled role")[:200]

    raw_currency = job.salary_currency or ""
    if len(raw_currency) > 3:
        logger.warning(
            "promote: salary_currency truncated user=%s job=%s value=%r",
            user_id, job.id, raw_currency,
        )
    posted_salary_currency = (raw_currency or "USD")[:3].upper()

    company_name_raw = job.company_name or ""
    if not company_name_raw.strip():
        logger.debug(
            "promote: empty company_name fallback user=%s job=%s", user_id, job.id,
        )

    application = Application(
        user_id=user_id,
        company_id=company.id,
        role_title=role_title,
        url=job.source_url,
        jd_text=job.description,
        location=job.location,
        remote_type=remote_type,
        posted_salary_min=float(job.salary_min) if job.salary_min is not None else None,
        posted_salary_max=float(job.salary_max) if job.salary_max is not None else None,
        posted_salary_currency=posted_salary_currency,
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
    return application

