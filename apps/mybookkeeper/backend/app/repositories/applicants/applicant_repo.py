"""Repository for ``applicants`` — owns every query against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. All public functions filter by
``organization_id`` AND ``user_id`` — the dual scope is mandatory per
RENTALS_PLAN.md §8.1.

PII columns are passed in plaintext; the ``EncryptedString`` TypeDecorator
handles encryption at bind time. Equality lookups on PII columns are NOT
supported (Fernet ciphertext is non-deterministic) — find applicants via
``inquiry_id`` or by listing + iterating.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant


async def create(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID | None = None,
    legal_name: str | None = None,
    dob: str | None = None,
    employer_or_hospital: str | None = None,
    vehicle_make_model: str | None = None,
    id_document_storage_key: str | None = None,
    contract_start: _dt.date | None = None,
    contract_end: _dt.date | None = None,
    smoker: bool | None = None,
    pets: str | None = None,
    referred_by: str | None = None,
    stage: str = "lead",
) -> Applicant:
    """Persist an Applicant. PII args are plaintext — encryption is automatic."""
    applicant = Applicant(
        organization_id=organization_id,
        user_id=user_id,
        inquiry_id=inquiry_id,
        legal_name=legal_name,
        dob=dob,
        employer_or_hospital=employer_or_hospital,
        vehicle_make_model=vehicle_make_model,
        id_document_storage_key=id_document_storage_key,
        contract_start=contract_start,
        contract_end=contract_end,
        smoker=smoker,
        pets=pets,
        referred_by=referred_by,
        stage=stage,
    )
    db.add(applicant)
    await db.flush()
    return applicant


async def get(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    include_deleted: bool = False,
) -> Applicant | None:
    """Return the applicant iff it belongs to (organization_id, user_id).

    Defaults to skipping soft-deleted rows. Set ``include_deleted=True`` from
    admin / retention contexts that need to see purged rows.
    """
    stmt = select(Applicant).where(
        Applicant.id == applicant_id,
        Applicant.organization_id == organization_id,
        Applicant.user_id == user_id,
    )
    if not include_deleted:
        stmt = stmt.where(Applicant.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_for_user(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    stage: str | None = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[Applicant]:
    """List applicants for (organization_id, user_id). Newest first."""
    stmt = select(Applicant).where(
        Applicant.organization_id == organization_id,
        Applicant.user_id == user_id,
    )
    if not include_deleted:
        stmt = stmt.where(Applicant.deleted_at.is_(None))
    if stage is not None:
        stmt = stmt.where(Applicant.stage == stage)
    stmt = stmt.order_by(desc(Applicant.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_for_user(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    stage: str | None = None,
    include_deleted: bool = False,
) -> int:
    """Count applicants for (organization_id, user_id) — used for paginated totals."""
    stmt = select(func.count()).select_from(Applicant).where(
        Applicant.organization_id == organization_id,
        Applicant.user_id == user_id,
    )
    if not include_deleted:
        stmt = stmt.where(Applicant.deleted_at.is_(None))
    if stage is not None:
        stmt = stmt.where(Applicant.stage == stage)
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def get_by_inquiry(
    db: AsyncSession,
    *,
    inquiry_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Applicant | None:
    """Return the active Applicant promoted from the given Inquiry, if any.

    Used by the (future) PR 3.2 promotion service to detect when an inquiry
    has already been promoted. Skips soft-deleted rows by design — a previously
    declined-then-purged applicant should not block a re-promotion.
    """
    result = await db.execute(
        select(Applicant).where(
            Applicant.inquiry_id == inquiry_id,
            Applicant.organization_id == organization_id,
            Applicant.user_id == user_id,
            Applicant.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def soft_delete(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Soft-delete an applicant. Returns True iff a row was updated."""
    result = await db.execute(
        update(Applicant)
        .where(
            Applicant.id == applicant_id,
            Applicant.organization_id == organization_id,
            Applicant.user_id == user_id,
            Applicant.deleted_at.is_(None),
        )
        .values(deleted_at=_dt.datetime.now(_dt.timezone.utc))
    )
    return (result.rowcount or 0) > 0


async def update_stage(
    db: AsyncSession,
    *,
    applicant: Applicant,
    new_stage: str,
    now: _dt.datetime,
) -> None:
    """Update the stage and updated_at on an already-loaded Applicant row.

    Caller is responsible for verifying tenant scope before calling (via
    ``applicant_repo.get()``). The ``update`` path uses an ORM attribute
    assignment so SQLAlchemy tracks the dirty column — no raw UPDATE needed.
    """
    applicant.stage = new_stage
    applicant.updated_at = now


async def update_contract_dates(
    db: AsyncSession,
    *,
    applicant: Applicant,
    contract_start: _dt.date | None,
    contract_end: _dt.date | None,
    now: _dt.datetime,
) -> None:
    """Update contract_start / contract_end on an already-loaded Applicant row.

    Only the fields explicitly passed (non-sentinel) are written — but this
    function always receives the final resolved values from the service layer,
    so it does a simple assignment on both.

    Caller is responsible for verifying tenant scope and the lock check
    (``stage != 'lease_signed'``) before calling.
    """
    applicant.contract_start = contract_start
    applicant.contract_end = contract_end
    applicant.updated_at = now


async def list_pending_purge(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    older_than_days: int,
) -> list[Applicant]:
    """Return soft-deleted applicants whose PII has not yet been purged.

    Used by the (future) retention worker (RENTALS_PLAN.md §6.6) to find
    rows ready for the 1-year-post-decline PII purge. Scoped by ``user_id``
    only because the worker iterates per-user.

    Returns rows where:
        deleted_at IS NOT NULL
        AND sensitive_purged_at IS NULL
        AND deleted_at < (now - older_than_days)
    """
    cutoff = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=older_than_days)
    result = await db.execute(
        select(Applicant).where(
            Applicant.user_id == user_id,
            Applicant.deleted_at.is_not(None),
            Applicant.sensitive_purged_at.is_(None),
            Applicant.deleted_at < cutoff,
        )
    )
    return list(result.scalars().all())
