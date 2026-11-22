"""The utility plan list's ``renewal`` sort, paged by the server.

The phone used to re-sort whatever pages it had loaded, so a plan about to
lapse could sit unseen on page 2 and then jump above rows already scrolled
past. These tests pin that the server cuts every page from one total order:
lapsed, then ending within the window, then later, then no term, then past
plans; soonest term end first within each band. ``TODAY`` is passed in, as the
route passes the caller's local date, so the boundaries are exact.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utility_plan_constants import (
    EXPIRING_SOON_DAYS,
    RATE_TYPE_FIXED,
    RATE_TYPE_REGULATED,
    SERVICE_TYPE_ELECTRICITY,
    SERVICE_TYPE_INTERNET,
    SERVICE_TYPE_NATURAL_GAS,
    SERVICE_TYPE_WATER,
)
from app.models.properties.property import Property
from app.repositories.properties import utility_plan_repo
from app.schemas.properties.utility_plan_list_sort import UtilityPlanListSort
from app.services.properties import utility_plan_service

pytestmark = pytest.mark.asyncio

TODAY = _dt.date(2026, 8, 7)
_UOW_TARGET = "app.services.properties.utility_plan_service.unit_of_work"

# Provider names in the order the renewal sort must return them.
RENEWAL_ORDER = [
    "Lapsed",       # current, ended before today
    "Ends today",   # current, 0 days left: still expiring, not lapsed
    "Soon",         # current, 10 days left; oldest start date, so last by default
    "Window edge",  # current, exactly EXPIRING_SOON_DAYS left
    "Past window",  # current, one day outside the window
    "Later",        # current, far off
    "Undated",      # current, no end recorded: leads its band
    "CenterPoint",  # regulated, nothing to renew whatever the date says
    "Old REP",      # superseded, expired, but history
]


def _fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


async def _property(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, name: str) -> Property:
    prop = Property(id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name=name, address=name)
    db.add(prop)
    await db.flush()
    return prop


async def _plan(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    prop: Property,
    service_type: str,
    provider: str,
    start: _dt.date | None,
    end: _dt.date | None,
    rate_type: str = RATE_TYPE_FIXED,
) -> None:
    await utility_plan_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        property_id=prop.id,
        service_type=service_type,
        provider_name=provider,
        rate_type=rate_type,
        service_start_date=start,
        term_end_date=end,
    )


def _days(n: int) -> _dt.date:
    return TODAY + _dt.timedelta(days=n)


async def _seed(db: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    oak = await _property(db, org_id, user_id, "Oak St")
    elm = await _property(db, org_id, user_id, "Elm St")
    await _plan(db, org_id, user_id, oak, SERVICE_TYPE_ELECTRICITY, "Old REP", _dt.date(2024, 1, 1), _dt.date(2025, 1, 1))
    await _plan(db, org_id, user_id, oak, SERVICE_TYPE_ELECTRICITY, "Lapsed", _dt.date(2025, 1, 1), _dt.date(2026, 1, 1))
    await _plan(db, org_id, user_id, elm, SERVICE_TYPE_ELECTRICITY, "Soon", _dt.date(2020, 1, 1), _days(10))
    await _plan(db, org_id, user_id, elm, SERVICE_TYPE_INTERNET, "Ends today", _dt.date(2026, 2, 1), TODAY)
    await _plan(db, org_id, user_id, oak, SERVICE_TYPE_WATER, "Window edge", _dt.date(2026, 3, 1), _days(EXPIRING_SOON_DAYS))
    await _plan(db, org_id, user_id, elm, SERVICE_TYPE_NATURAL_GAS, "Past window", _dt.date(2026, 4, 1), _days(EXPIRING_SOON_DAYS + 1))
    await _plan(db, org_id, user_id, oak, SERVICE_TYPE_INTERNET, "Later", _dt.date(2026, 7, 1), _days(200))
    await _plan(
        db, org_id, user_id, oak, SERVICE_TYPE_NATURAL_GAS, "CenterPoint", _dt.date(2019, 1, 1), _dt.date(2020, 1, 1),
        rate_type=RATE_TYPE_REGULATED,
    )
    await _plan(db, org_id, user_id, elm, SERVICE_TYPE_WATER, "Undated", _dt.date(2026, 5, 1), None)
    return org_id, user_id


async def _pages(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, *, size: int, sort: UtilityPlanListSort,
) -> list[list[str]]:
    pages: list[list[str]] = []
    offset = 0
    with patch(_UOW_TARGET, _fake_uow(db)):
        while True:
            page = await utility_plan_service.list_plans(
                user_id=user_id, organization_id=org_id, sort=sort, limit=size, offset=offset, today=TODAY,
            )
            pages.append([p.provider_name for p in page.items])
            if not page.has_more:
                return pages
            offset += size


class TestRenewalSort:
    async def test_every_page_is_cut_from_one_urgency_order(self, db: AsyncSession) -> None:
        org_id, user_id = await _seed(db)

        pages = await _pages(db, org_id, user_id, size=4, sort=UtilityPlanListSort.RENEWAL)

        assert pages == [RENEWAL_ORDER[0:4], RENEWAL_ORDER[4:8], RENEWAL_ORDER[8:]]

    async def test_a_plan_ending_soon_is_on_the_first_page_not_a_later_one(self, db: AsyncSession) -> None:
        org_id, user_id = await _seed(db)

        by_start = await _pages(db, org_id, user_id, size=4, sort=UtilityPlanListSort.RECENT)
        by_renewal = await _pages(db, org_id, user_id, size=4, sort=UtilityPlanListSort.RENEWAL)

        # By start date it would only turn up after "Load more".
        assert "Soon" not in by_start[0]
        assert "Soon" in by_renewal[0]

    async def test_recent_stays_the_default(self, db: AsyncSession) -> None:
        org_id, user_id = await _seed(db)

        with patch(_UOW_TARGET, _fake_uow(db)):
            default = await utility_plan_service.list_plans(user_id=user_id, organization_id=org_id, today=TODAY)

        assert [p.provider_name for p in default.items][:2] == ["Later", "Undated"]

    async def test_ties_go_by_property_then_service_and_never_shift_between_pages(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        beta = await _property(db, org_id, user_id, "beta St")
        alpha = await _property(db, org_id, user_id, "Alpha St")
        same_day = _days(20)
        await _plan(db, org_id, user_id, beta, SERVICE_TYPE_ELECTRICITY, "Beta power", None, same_day)
        await _plan(db, org_id, user_id, alpha, SERVICE_TYPE_WATER, "Alpha water", None, same_day)
        await _plan(db, org_id, user_id, alpha, SERVICE_TYPE_ELECTRICITY, "Alpha power", None, same_day)
        # Two rows that tie on everything but id still come back in one fixed order.
        await _plan(db, org_id, user_id, beta, SERVICE_TYPE_INTERNET, "Twin", None, same_day)
        await _plan(db, org_id, user_id, beta, SERVICE_TYPE_INTERNET, "Twin", None, same_day)

        whole = await _pages(db, org_id, user_id, size=10, sort=UtilityPlanListSort.RENEWAL)
        one_at_a_time = await _pages(db, org_id, user_id, size=1, sort=UtilityPlanListSort.RENEWAL)

        assert whole == [["Alpha power", "Alpha water", "Beta power", "Twin", "Twin"]]
        assert [name for page in one_at_a_time for name in page] == whole[0]

    async def test_the_repository_refuses_a_renewal_order_without_current_plans(self, db: AsyncSession) -> None:
        with pytest.raises(ValueError):
            await utility_plan_repo.list_for_org(
                db, user_id=uuid.uuid4(), organization_id=uuid.uuid4(), renewal_order_on=TODAY,
            )
