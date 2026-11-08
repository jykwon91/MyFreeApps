"""Hosts can add, change and remove an applicant's contact email.

The lease page tells a host with no tenant email to "add one on the
applicant page", so the applicant needs an edit path. The address is PII:
the event row says what kind of change happened, never the address.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.models.organization.organization_member import OrgRole
from app.schemas.applicants.applicant_contact_email_request import (
    ApplicantContactEmailRequest,
)
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.services.applicants import applicant_contact_service


class TestRequest:
    def test_trims_a_valid_address(self) -> None:
        req = ApplicantContactEmailRequest(contact_email="  ann@example.com ")
        assert req.contact_email == "ann@example.com"

    @pytest.mark.parametrize("value", [None, "", "   "])
    def test_blank_means_remove(self, value: str | None) -> None:
        assert ApplicantContactEmailRequest(contact_email=value).contact_email is None

    @pytest.mark.parametrize("value", ["not-an-email", "a@", "@b.com"])
    def test_rejects_an_invalid_address(self, value: str) -> None:
        with pytest.raises(ValidationError):
            ApplicantContactEmailRequest(contact_email=value)

    def test_rejects_an_address_over_the_column_limit(self) -> None:
        with pytest.raises(ValidationError):
            ApplicantContactEmailRequest(contact_email=f"{'a' * 250}@example.com")

    def test_rejects_stray_fields(self) -> None:
        with pytest.raises(ValidationError):
            ApplicantContactEmailRequest.model_validate(
                {"contact_email": "a@example.com", "legal_name": "x"},
            )


def _fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session
    return _uow


async def _change(db: AsyncSession, applicant: Applicant, email: str | None, *, org=None, user=None):
    with (
        patch.object(applicant_contact_service, "unit_of_work", _fake_uow(db)),
        patch.object(applicant_contact_service.applicant_service, "get_applicant", new=AsyncMock()),
    ):
        await applicant_contact_service.update_contact_email(
            organization_id=org or applicant.organization_id,
            user_id=user or applicant.user_id,
            applicant_id=applicant.id,
            contact_email=email,
        )


async def _events(db: AsyncSession, applicant: Applicant) -> list[ApplicantEvent]:
    rows = await db.execute(
        select(ApplicantEvent).where(
            ApplicantEvent.applicant_id == applicant.id,
            ApplicantEvent.event_type == "contact_email_changed",
        ),
    )
    return list(rows.scalars())


async def _applicant(db: AsyncSession, email: str | None) -> Applicant:
    applicant = Applicant(
        id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=uuid.uuid4(),
        stage="lease_signed", contact_email=email,
    )
    db.add(applicant)
    await db.flush()
    return applicant


class TestService:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("before", "after", "change"),
        [
            (None, "new@example.com", "added"),
            ("old@example.com", "new@example.com", "changed"),
            ("old@example.com", None, "removed"),
        ],
    )
    async def test_saves_and_records_the_kind_of_change_without_the_address(
        self, db: AsyncSession, before: str | None, after: str | None, change: str,
    ) -> None:
        applicant = await _applicant(db, before)

        await _change(db, applicant, after)

        await db.refresh(applicant)
        assert applicant.contact_email == after
        events = await _events(db, applicant)
        assert [e.payload for e in events] == [{"change": change}]
        assert events[0].actor == "host"
        assert "example.com" not in str(events[0].payload)

    @pytest.mark.asyncio
    async def test_works_after_the_lease_is_signed_and_skips_a_no_op(self, db: AsyncSession) -> None:
        applicant = await _applicant(db, "same@example.com")

        await _change(db, applicant, "same@example.com")

        assert await _events(db, applicant) == []

    @pytest.mark.asyncio
    async def test_refuses_another_tenant(self, db: AsyncSession) -> None:
        applicant = await _applicant(db, None)

        with pytest.raises(LookupError):
            await _change(db, applicant, "x@example.com", org=uuid.uuid4())

        await db.refresh(applicant)
        assert applicant.contact_email is None
        assert await _events(db, applicant) == []


@pytest.fixture
def client() -> Iterator[TestClient]:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[require_write_access] = lambda: ctx
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _detail() -> ApplicantDetailResponse:
    now = _dt.datetime.now(_dt.UTC)
    return ApplicantDetailResponse(
        id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=uuid.uuid4(),
        inquiry_id=None, legal_name="Ann", stage="lead", contract_start=None,
        contract_end=None, has_contact_email=True, created_at=now, updated_at=now,
    )


class TestRoute:
    def test_passes_the_cleaned_address_to_the_service(self, client: TestClient) -> None:
        with patch(
            "app.api.applicants.applicant_contact_service.update_contact_email",
            new=AsyncMock(return_value=_detail()),
        ) as svc:
            resp = client.patch(f"/applicants/{uuid.uuid4()}/contact-email", json={"contact_email": " a@example.com "})

        assert resp.status_code == 200
        assert resp.json()["has_contact_email"] is True
        assert svc.await_args.kwargs["contact_email"] == "a@example.com"

    def test_unknown_applicant_is_404(self, client: TestClient) -> None:
        with patch(
            "app.api.applicants.applicant_contact_service.update_contact_email",
            new=AsyncMock(side_effect=LookupError()),
        ):
            resp = client.patch(f"/applicants/{uuid.uuid4()}/contact-email", json={"contact_email": None})

        assert resp.status_code == 404

    def test_invalid_address_is_422(self, client: TestClient) -> None:
        resp = client.patch(f"/applicants/{uuid.uuid4()}/contact-email", json={"contact_email": "nope"})
        assert resp.status_code == 422

    def test_requires_write_access(self) -> None:
        app.dependency_overrides.clear()
        resp = TestClient(app).patch(f"/applicants/{uuid.uuid4()}/contact-email", json={"contact_email": None})
        assert resp.status_code == 401
