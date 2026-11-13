"""Service wrappers for discovered-job inbox mutations.

Owns the transaction boundary for dismiss and save operations so route
handlers never call ``db.commit()`` directly.  Per the MJH layered-architecture
convention: routes → services → repositories; services commit, repositories
only ``add``/``flush``.
"""
from __future__ import annotations

import uuid
from typing import NoReturn

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.discovered_job_state import DiscoveredJobState
from app.db.violated_constraint import violated_constraint_name
from app.models.discovery.discovered_job import DiscoveredJob
from app.repositories.discovery import (
    discovery_duplicate_repository,
    discovery_inbox_repository,
    discovery_repository,
)
from app.services.discovery.discovered_job_page import DiscoveredJobPage


class DiscoveredJobAlreadyAppliedError(RuntimeError):
    """The posting was already turned into an application — HTTP 409."""


class DiscoveredJobDuplicateError(RuntimeError):
    """The posting's twin from another source is already in Discover — HTTP 409."""


class DiscoveredJobNoLongerListedError(RuntimeError):
    """The posting's twin from another source has expired or closed — HTTP 409."""


def _refuse_applied(job: DiscoveredJob) -> None:
    """Raise ``DiscoveredJobAlreadyAppliedError`` when ``job`` is an application.

    A promoted posting is in no Discover view, so a triage write on it (a stale
    card, or a tap while Apply was in flight) would strand it or put it back in
    a list. Deleting the application clears the link, so a link always means a
    live application.
    """
    if job.promoted_application_id is not None:
        raise DiscoveredJobAlreadyAppliedError(
            f"discovered_job {job.id} is already application {job.promoted_application_id}",
        )


async def _refuse_twin(db: AsyncSession, job: DiscoveredJob) -> None:
    """Refuse to clear ``job``'s dismissal while its twin holds the content-hash slot.

    Clearing it would list the same posting twice (an IntegrityError on
    ``uq_discovered_user_content_hash``). The answer says where the posting is:
    an applied twin is in Applications; a twin that has expired or closed means
    the posting is no longer listed; otherwise it is in Discover already.
    """
    twin = await discovery_duplicate_repository.get_active_twin(db, job)
    if twin is None:
        return
    _refuse_applied(twin)
    if not await discovery_duplicate_repository.is_listed(db, twin):
        raise DiscoveredJobNoLongerListedError(f"discovered_job {job.id} has unlisted twin {twin.id}")
    raise DiscoveredJobDuplicateError(f"discovered_job {job.id} has active twin {twin.id}")


async def _refuse_twin_arrived(db: AsyncSession, exc: IntegrityError, job_id: uuid.UUID) -> NoReturn:
    """Roll back a write a twin beat to the content-hash slot, as ``DiscoveredJobDuplicateError``.

    A fetch inserted the twin after ``_refuse_twin`` looked; the outcome is the
    same as if it had been there first. Any other integrity error is re-raised.
    """
    await db.rollback()
    if violated_constraint_name(exc) != discovery_duplicate_repository.TWIN_INDEX_NAME:
        raise exc
    raise DiscoveredJobDuplicateError(f"discovered_job {job_id}: a twin arrived meanwhile") from exc


async def _load_for_triage(
    db: AsyncSession, job_id: uuid.UUID, user_id: uuid.UUID,
) -> DiscoveredJob | None:
    """The caller's posting, locked, for Dismiss or Save. None when not found / wrong owner.

    Raises ``DiscoveredJobAlreadyAppliedError`` for an applied posting. The row
    lock makes the check hold against a concurrent Promote.
    """
    job = await discovery_repository.get_discovered(db, job_id, user_id, for_update=True)
    if job is not None:
        _refuse_applied(job)
    return job


async def dismiss_discovered(
    db: AsyncSession,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    reason: str | None = None,
) -> bool:
    """Dismiss a discovered job.  Returns False when not found / wrong owner.

    Raises ``DiscoveredJobAlreadyAppliedError`` for an applied posting.
    """
    job = await _load_for_triage(db, job_id, user_id)
    if job is None:
        return False
    await discovery_repository.dismiss_discovered(db, job, reason=reason)
    await db.commit()
    return True


async def undo_dismiss_for_user(
    db: AsyncSession,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Reverse a dismiss — clears dismissed_at and dismissed_reason.

    Returns False (→ 404) when the Dismissed view doesn't list the job: it
    doesn't exist / belongs to a different user, isn't dismissed, has
    expired/closed, or is an application. When its twin from another source
    holds the content-hash slot, raises what ``_refuse_twin`` says.
    """
    job = await discovery_repository.get_restorable(db, job_id, user_id)
    if job is None:
        return False
    await _refuse_twin(db, job)
    try:
        await discovery_repository.undo_dismiss_discovered(db, job)
        await db.commit()
    except IntegrityError as exc:
        await _refuse_twin_arrived(db, exc, job_id)
    return True


async def save_discovered(
    db: AsyncSession,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Save a discovered job for later.  Returns False when not found / wrong owner.

    Raises ``DiscoveredJobAlreadyAppliedError`` for an applied posting. For a
    dismissed one whose twin from another source holds the content-hash slot,
    raises what ``_refuse_twin`` says.
    """
    job = await _load_for_triage(db, job_id, user_id)
    if job is None:
        return False
    await _refuse_twin(db, job)
    try:
        await discovery_repository.save_discovered(db, job)
        await db.commit()
    except IntegrityError as exc:
        await _refuse_twin_arrived(db, exc, job_id)
    return True


async def list_discovered_page(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    state: DiscoveredJobState,
    limit: int,
    offset: int,
    source_id: uuid.UUID | None,
) -> DiscoveredJobPage:
    """Load one page of discovered jobs plus its pagination/coverage counts."""
    rows = await discovery_repository.list_discovered(
        db, user_id, state=state, limit=limit, offset=offset, source_id=source_id,
    )

    # Coverage is only meaningful for the triage inbox: most fetched rows
    # stay unscored (the scorer only rates the prefilter top-N per day),
    # and the frontend surfaces "Scored N of M" so that tail reads as
    # "daily limit reached" rather than "broken". The other views
    # don't carry the framing, so leave the counts null there.
    scored_count: int | None = None
    total_count: int | None = None
    if state == "inbox":
        scored_count, total_count = await discovery_inbox_repository.count_inbox_coverage(
            db, user_id, source_id=source_id,
        )
        # The inbox pagination total IS the active-inbox row count, which
        # count_inbox_coverage already computed — reuse it (no second COUNT).
        total = total_count
    else:
        total = await discovery_inbox_repository.count_discovered(
            db, user_id, state=state, source_id=source_id,
        )
    return DiscoveredJobPage(
        rows=rows, total=total, scored_count=scored_count, total_count=total_count,
    )
