"""The Leases list's groups, against the database and the route."""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.lease_enums import LEASE_STATUS_GROUPS, SIGNED_LEASE_STATUSES
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.repositories.leases import signed_lease_repo
from app.schemas.leases.signed_lease_list_response import SignedLeaseListResponse


async def _lease(
    db: AsyncSession,
    scope: dict[str, uuid.UUID],
    status: str,
    ends_on: _dt.date | None = None,
    starts_on: _dt.date | None = None,
):
    return await signed_lease_repo.create(
        db, **scope, applicant_id=uuid.uuid4(), listing_id=None, values={},
        starts_on=starts_on, ends_on=ends_on, status=status,
    )


@pytest.fixture
def scope() -> dict[str, uuid.UUID]:
    return {"user_id": uuid.uuid4(), "organization_id": uuid.uuid4()}


def test_every_group_holds_real_statuses() -> None:
    for statuses in LEASE_STATUS_GROUPS.values():
        assert set(statuses) <= set(SIGNED_LEASE_STATUSES)


@pytest.mark.asyncio
async def test_list_and_count_agree_on_a_group(db: AsyncSession, scope: dict[str, uuid.UUID]) -> None:
    signed = await _lease(db, scope, "signed")
    active = await _lease(db, scope, "active")
    await _lease(db, scope, "draft")
    await _lease(db, scope, "ended")
    current = LEASE_STATUS_GROUPS["current"]

    rows = await signed_lease_repo.list_for_tenant(db, **scope, statuses=current)
    total = await signed_lease_repo.count_for_tenant(db, **scope, statuses=current)

    assert {row.id for row in rows} == {signed.id, active.id}
    assert total == 2


@pytest.mark.asyncio
async def test_a_group_stays_inside_the_callers_organization(db: AsyncSession, scope: dict[str, uuid.UUID]) -> None:
    await _lease(db, {"user_id": scope["user_id"], "organization_id": uuid.uuid4()}, "active")
    rows = await signed_lease_repo.list_for_tenant(db, **scope, statuses=("active",))
    assert rows == []


@pytest.mark.asyncio
async def test_soonest_end_first_puts_open_ended_leases_last(db: AsyncSession, scope: dict[str, uuid.UUID]) -> None:
    later = await _lease(db, scope, "active", ends_on=_dt.date(2027, 6, 1))
    no_end = await _lease(db, scope, "active")
    sooner = await _lease(db, scope, "active", ends_on=_dt.date(2027, 1, 1))

    rows = await signed_lease_repo.list_for_tenant(db, **scope, soonest_end_first=True)

    assert [row.id for row in rows] == [sooner.id, later.id, no_end.id]


@pytest.mark.asyncio
async def test_pages_neither_repeat_nor_lose_leases_sharing_an_end_date(db: AsyncSession, scope: dict[str, uuid.UUID]) -> None:
    same_day = _dt.date(2027, 1, 1)
    ids = {(await _lease(db, scope, "active", ends_on=same_day)).id for _ in range(5)}

    seen: list[uuid.UUID] = []
    for offset in range(0, 5, 2):
        rows = await signed_lease_repo.list_for_tenant(db, **scope, soonest_end_first=True, limit=2, offset=offset)
        seen += [row.id for row in rows]

    assert len(seen) == 5
    assert set(seen) == ids


@pytest.mark.asyncio
async def test_count_honours_the_start_date_filters_the_list_uses(db: AsyncSession, scope: dict[str, uuid.UUID]) -> None:
    await _lease(db, scope, "active", starts_on=_dt.date(2026, 1, 1))
    await _lease(db, scope, "active", starts_on=_dt.date(2027, 1, 1))
    cutoff = {"starts_after": _dt.date(2026, 6, 1)}

    rows = await signed_lease_repo.list_for_tenant(db, **scope, **cutoff)
    total = await signed_lease_repo.count_for_tenant(db, **scope, **cutoff)

    assert len(rows) == total == 1


@pytest.mark.parametrize(("query", "expected"), [("", None), ("?group=current", "current"), ("?group=ended", "ended")])
def test_the_route_passes_the_group_on(query: str, expected: str | None) -> None:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[current_org_member] = lambda: ctx
    try:
        with patch(
            "app.api.signed_leases.signed_lease_service.list_leases",
            new_callable=AsyncMock,
            return_value=SignedLeaseListResponse(items=[], total=0, has_more=False),
        ) as list_leases:
            resp = TestClient(app).get(f"/signed-leases{query}")
        assert resp.status_code == 200
        assert list_leases.call_args.kwargs["group"] == expected
    finally:
        app.dependency_overrides.clear()


def test_the_route_refuses_an_unknown_group() -> None:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[current_org_member] = lambda: ctx
    try:
        assert TestClient(app).get("/signed-leases?group=nope").status_code == 422
    finally:
        app.dependency_overrides.clear()
