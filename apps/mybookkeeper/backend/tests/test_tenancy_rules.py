"""Rules for ending a tenancy, run against the database.

A second "end" must not rewrite the date and reason already on record, and a
lease ends at the host's midnight, which can differ from the server's date.
"""
from __future__ import annotations

import datetime as _dt
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.leases.signed_lease import SignedLease
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.applicants import applicant_repo
from app.services.applicants import tenancy_service

LAST_DAY = _dt.date(2026, 11, 3)


async def _tenant(
    db: AsyncSession,
    user: User,
    org: Organization,
    *,
    ends_on: _dt.date | None = None,
    ended_at: _dt.datetime | None = None,
    ended_reason: str | None = None,
) -> Applicant:
    applicant = Applicant(
        organization_id=org.id,
        user_id=user.id,
        stage="lease_signed",
        legal_name="Tenant",
        tenant_ended_at=ended_at,
        tenant_ended_reason=ended_reason,
    )
    db.add(applicant)
    await db.flush()
    if ends_on is not None:
        db.add(SignedLease(
            user_id=user.id,
            organization_id=org.id,
            applicant_id=applicant.id,
            kind="imported",
            status="active",
            starts_on=_dt.date(2026, 1, 1),
            ends_on=ends_on,
        ))
        await db.flush()
    return applicant


class TestEndTenancy:
    @pytest.mark.asyncio
    async def test_ending_twice_keeps_the_original_date_and_reason(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ended_at = _dt.datetime(2026, 10, 1, 12, tzinfo=_dt.timezone.utc)
        applicant = await _tenant(
            db, test_user, test_org, ended_at=ended_at, ended_reason="Moved out",
        )

        @asynccontextmanager
        async def same_session() -> AsyncIterator[AsyncSession]:
            yield db

        with (
            patch("app.services.applicants.tenancy_service.unit_of_work", same_session),
            patch(
                "app.services.applicants.tenancy_service.applicant_event_repo.append",
                new_callable=AsyncMock,
            ) as append_event,
            pytest.raises(tenancy_service.TenancyAlreadyEndedError),
        ):
            await tenancy_service.end_tenancy(
                organization_id=test_org.id,
                user_id=test_user.id,
                applicant_id=applicant.id,
                reason="Second try",
            )

        append_event.assert_not_called()
        await db.refresh(applicant)
        assert applicant.tenant_ended_reason == "Moved out"
        assert applicant.tenant_ended_at.replace(tzinfo=_dt.timezone.utc) == ended_at


class TestHostsDate:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("today", "still_current"),
        [
            (LAST_DAY, True),
            (LAST_DAY + _dt.timedelta(days=1), False),
        ],
    )
    async def test_a_lease_ends_after_the_hosts_last_day(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        today: _dt.date,
        still_current: bool,
    ) -> None:
        applicant = await _tenant(db, test_user, test_org, ends_on=LAST_DAY)
        scope = {"organization_id": test_org.id, "user_id": test_user.id}

        current = await applicant_repo.list_tenants(db, **scope, today=today)
        count = await applicant_repo.count_tenants(db, **scope, today=today)
        everyone = await applicant_repo.list_tenants(
            db, **scope, include_ended=True, today=today,
        )

        assert ([a.id for a in current] == [applicant.id]) is still_current
        assert count == (1 if still_current else 0)
        assert [a.id for a in everyone] == [applicant.id]
