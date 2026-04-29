"""Repository for ``screening_results``.

Tenant scoping: ``ScreeningResult`` rows have no ``organization_id`` or
``user_id`` of their own — they're scoped through their parent ``Applicant``.
Every public function joins to ``applicants`` and filters by the caller's
``(organization_id, user_id)`` to prevent cross-tenant access.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.screening_result import ScreeningResult


async def create(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    provider: str,
    requested_at: _dt.datetime,
    uploaded_by_user_id: uuid.UUID,
    status: str = "pending",
    report_storage_key: str | None = None,
    adverse_action_snippet: str | None = None,
    notes: str | None = None,
    completed_at: _dt.datetime | None = None,
    uploaded_at: _dt.datetime | None = None,
) -> ScreeningResult:
    """Create a screening_result row. Caller is responsible for proving the
    applicant belongs to the calling tenant via ``applicant_repo.get()``
    BEFORE calling this — services compose, repos do not double-check.

    ``uploaded_by_user_id`` is required (NOT NULL on the row). For PR 3.3
    record-result the caller passes the route's request-context user; for
    legacy seed paths (test_utils, prior PR 3.1a tests) the caller passes
    the parent applicant's user_id as a sensible default.
    """
    kwargs: dict[str, object] = {
        "applicant_id": applicant_id,
        "provider": provider,
        "requested_at": requested_at,
        "uploaded_by_user_id": uploaded_by_user_id,
        "status": status,
        "report_storage_key": report_storage_key,
        "adverse_action_snippet": adverse_action_snippet,
        "notes": notes,
        "completed_at": completed_at,
    }
    if uploaded_at is not None:
        kwargs["uploaded_at"] = uploaded_at
    sr = ScreeningResult(**kwargs)
    db.add(sr)
    await db.flush()
    return sr


async def list_for_applicant(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[ScreeningResult]:
    """List screenings for an applicant, scoped through the parent's tenancy.

    Returns [] if the applicant doesn't belong to (organization_id, user_id).
    Sort: newest-uploaded first — upload time is what hosts care about when
    scanning the screening history (which report was reviewed most recently),
    and ``requested_at`` only diverges from ``uploaded_at`` on the rare
    in-flight ``pending`` rows.
    """
    result = await db.execute(
        select(ScreeningResult)
        .join(Applicant, Applicant.id == ScreeningResult.applicant_id)
        .where(
            ScreeningResult.applicant_id == applicant_id,
            Applicant.organization_id == organization_id,
            Applicant.user_id == user_id,
        )
        .order_by(desc(ScreeningResult.uploaded_at))
    )
    return list(result.scalars().all())


async def update_status(
    db: AsyncSession,
    *,
    screening_result_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str,
    completed_at: _dt.datetime | None = None,
    adverse_action_snippet: str | None = None,
) -> ScreeningResult | None:
    """Update status / completion of a screening_result.

    Tenant-scoped: returns None if the parent applicant doesn't belong to
    (organization_id, user_id) — prevents cross-tenant updates via a forged
    screening_result_id.
    """
    # Look up the row through a tenant-scoped join first.
    found = await db.execute(
        select(ScreeningResult)
        .join(Applicant, Applicant.id == ScreeningResult.applicant_id)
        .where(
            ScreeningResult.id == screening_result_id,
            Applicant.organization_id == organization_id,
            Applicant.user_id == user_id,
        )
    )
    sr = found.scalar_one_or_none()
    if sr is None:
        return None

    values: dict[str, object] = {"status": status}
    if completed_at is not None:
        values["completed_at"] = completed_at
    if adverse_action_snippet is not None:
        values["adverse_action_snippet"] = adverse_action_snippet

    await db.execute(
        update(ScreeningResult)
        .where(ScreeningResult.id == screening_result_id)
        .values(**values)
    )
    await db.flush()
    await db.refresh(sr)
    return sr
