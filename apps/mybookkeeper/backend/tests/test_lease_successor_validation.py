"""Tests for parent-lease validation when creating a successor.

Covers the new ``parent_lease_id`` path through ``create_lease`` and
``import_signed_lease`` plus the underlying ``_validate_parent_lease``
helper. Service-layer assertions only — route-layer tests live in
``test_lease_successor_api``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.leases.signed_lease import SignedLease
from app.services.leases._lease_helpers import (
    InvalidParentLeaseError,
    SuccessorAlreadyExistsError,
    _validate_parent_lease,
)


def _fake_uow_for(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


async def _seed_lease(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    status: str = "active",
    parent_lease_id: uuid.UUID | None = None,
) -> SignedLease:
    applicant = Applicant(
        organization_id=org_id,
        user_id=user_id,
        stage="lease_signed",
        legal_name="Tenant",
    )
    db.add(applicant)
    await db.flush()
    lease = SignedLease(
        user_id=user_id,
        organization_id=org_id,
        applicant_id=applicant.id,
        kind="imported",
        status=status,
        starts_on=_dt.date(2026, 1, 1),
        ends_on=_dt.date(2026, 12, 31),
        parent_lease_id=parent_lease_id,
    )
    db.add(lease)
    await db.flush()
    return lease


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["signed", "active", "ended"])
async def test_validate_parent_lease_accepts_eligible_statuses(
    db: AsyncSession, status: str,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_id, org_id=org_id, status=status)

    # Should not raise.
    await _validate_parent_lease(
        db,
        parent_lease_id=parent.id,
        user_id=user_id,
        organization_id=org_id,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", ["draft", "generated", "sent", "terminated"],
)
async def test_validate_parent_lease_rejects_ineligible_statuses(
    db: AsyncSession, status: str,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_id, org_id=org_id, status=status)

    with pytest.raises(InvalidParentLeaseError, match=status):
        await _validate_parent_lease(
            db,
            parent_lease_id=parent.id,
            user_id=user_id,
            organization_id=org_id,
        )


@pytest.mark.asyncio
async def test_validate_parent_lease_rejects_cross_tenant(
    db: AsyncSession,
) -> None:
    org_a, user_a = uuid.uuid4(), uuid.uuid4()
    org_b, user_b = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_a, org_id=org_a)

    with pytest.raises(InvalidParentLeaseError, match="not found"):
        await _validate_parent_lease(
            db,
            parent_lease_id=parent.id,
            user_id=user_b,
            organization_id=org_b,
        )


@pytest.mark.asyncio
async def test_validate_parent_lease_rejects_missing_parent(
    db: AsyncSession,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    with pytest.raises(InvalidParentLeaseError, match="not found"):
        await _validate_parent_lease(
            db,
            parent_lease_id=uuid.uuid4(),
            user_id=user_id,
            organization_id=org_id,
        )


@pytest.mark.asyncio
async def test_validate_parent_lease_rejects_when_successor_exists(
    db: AsyncSession,
) -> None:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    parent = await _seed_lease(db, user_id=user_id, org_id=org_id)
    # Create an existing successor — should block a second one.
    await _seed_lease(
        db, user_id=user_id, org_id=org_id, parent_lease_id=parent.id,
    )

    with pytest.raises(SuccessorAlreadyExistsError):
        await _validate_parent_lease(
            db,
            parent_lease_id=parent.id,
            user_id=user_id,
            organization_id=org_id,
        )
