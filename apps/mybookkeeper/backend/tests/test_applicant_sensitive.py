"""The audited reveal of an applicant's private details."""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.core.rate_limit import RateLimiter
from app.main import app
from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories.applicants import (
    applicant_event_repo,
    applicant_repo,
    reference_repo,
    screening_result_repo,
)
from app.schemas.applicants.applicant_sensitive_response import ApplicantSensitiveResponse
from app.schemas.applicants.reference_contact_response import ReferenceContactResponse
from app.schemas.applicants.screening_report_response import ScreeningReportResponse
from app.services.applicants import applicant_sensitive_service, applicant_service
from app.services.screening import screening_service


@pytest.fixture
def storage() -> MagicMock:
    fake = MagicMock()
    fake.object_exists.return_value = True
    fake.generate_presigned_url.return_value = "https://storage.example/signed"
    with patch("app.services.storage.presigned_url_attacher.get_storage", return_value=fake):
        yield fake


@pytest.fixture
def same_session(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    @asynccontextmanager
    async def session() -> AsyncIterator[AsyncSession]:
        yield db
        await db.commit()

    monkeypatch.setattr(applicant_sensitive_service, "unit_of_work", session)
    monkeypatch.setattr(screening_service, "unit_of_work", session)
    monkeypatch.setattr(applicant_service, "AsyncSessionLocal", session)


async def _applicant(db: AsyncSession, user: User, org: Organization) -> Applicant:
    applicant = await applicant_repo.create(
        db,
        organization_id=org.id,
        user_id=user.id,
        legal_name="Jane Doe",
        dob="1990-01-15",
        vehicle_make_model="Blue Subaru",
        contact_email="jane@example.com",
        contact_phone="555-010-2030",
        stage="lead",
    )
    await reference_repo.create(
        db,
        applicant_id=applicant.id,
        relationship="employer",
        reference_name="Ref One",
        reference_contact="ref@example.com",
    )
    result = await screening_result_repo.create(
        db,
        applicant_id=applicant.id,
        provider="keycheck",
        requested_at=_dt.datetime.now(_dt.timezone.utc),
        uploaded_by_user_id=user.id,
        status="fail",
    )
    result.report_storage_key = "screening/a/b.pdf"
    result.adverse_action_snippet = "Credit score below threshold"
    await db.commit()
    return applicant


async def _reveal_events(db: AsyncSession, applicant_id: uuid.UUID) -> list[ApplicantEvent]:
    rows = await db.execute(
        select(ApplicantEvent).where(
            ApplicantEvent.applicant_id == applicant_id,
            ApplicantEvent.event_type == "sensitive_revealed",
        )
    )
    return list(rows.scalars().all())


@pytest.mark.usefixtures("same_session")
class TestReveal:
    @pytest.mark.asyncio
    async def test_returns_details_and_records_who_asked_without_values(
        self, db: AsyncSession, test_user: User, test_org: Organization, storage: MagicMock,
    ) -> None:
        applicant = await _applicant(db, test_user, test_org)

        details = await applicant_sensitive_service.reveal(test_org.id, test_user.id, applicant.id)

        assert details.dob == "1990-01-15"
        assert details.vehicle_make_model == "Blue Subaru"
        assert details.contact_email == "jane@example.com"
        assert details.contact_phone == "555-010-2030"
        assert details.references[0].reference_contact == "ref@example.com"
        assert details.screening_reports[0].adverse_action_snippet == "Credit score below threshold"
        assert details.screening_reports[0].presigned_url == "https://storage.example/signed"
        events = await _reveal_events(db, applicant.id)
        assert [e.payload for e in events] == [{"user_id": str(test_user.id)}]
        assert events[0].actor == "host"

    @pytest.mark.asyncio
    async def test_records_every_reveal(
        self, db: AsyncSession, test_user: User, test_org: Organization, storage: MagicMock,
    ) -> None:
        applicant = await _applicant(db, test_user, test_org)

        await applicant_sensitive_service.reveal(test_org.id, test_user.id, applicant.id)
        await applicant_sensitive_service.reveal(test_org.id, test_user.id, applicant.id)

        assert len(await _reveal_events(db, applicant.id)) == 2

    @pytest.mark.asyncio
    async def test_report_links_are_short_lived(
        self, db: AsyncSession, test_user: User, test_org: Organization, storage: MagicMock,
    ) -> None:
        applicant = await _applicant(db, test_user, test_org)

        await applicant_sensitive_service.reveal(test_org.id, test_user.id, applicant.id)

        assert storage.generate_presigned_url.call_args.args[1] == 300

    @pytest.mark.asyncio
    async def test_flags_a_report_missing_from_storage(
        self, db: AsyncSession, test_user: User, test_org: Organization, storage: MagicMock,
    ) -> None:
        applicant = await _applicant(db, test_user, test_org)
        storage.object_exists.return_value = False

        details = await applicant_sensitive_service.reveal(test_org.id, test_user.id, applicant.id)

        assert details.screening_reports[0].is_available is False
        assert details.screening_reports[0].presigned_url is None

    @pytest.mark.asyncio
    async def test_refuses_another_tenant_and_records_nothing(
        self, db: AsyncSession, test_user: User, test_org: Organization, storage: MagicMock,
    ) -> None:
        applicant = await _applicant(db, test_user, test_org)

        with pytest.raises(LookupError):
            await applicant_sensitive_service.reveal(uuid.uuid4(), test_user.id, applicant.id)
        with pytest.raises(LookupError):
            await applicant_sensitive_service.reveal(test_org.id, uuid.uuid4(), applicant.id)

        assert await _reveal_events(db, applicant.id) == []

    @pytest.mark.asyncio
    async def test_gives_no_data_when_the_record_cannot_be_written(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
        storage: MagicMock,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        applicant = await _applicant(db, test_user, test_org)
        monkeypatch.setattr(
            applicant_event_repo, "append", AsyncMock(side_effect=RuntimeError("database down")),
        )

        with pytest.raises(RuntimeError):
            await applicant_sensitive_service.reveal(test_org.id, test_user.id, applicant.id)


@pytest.mark.usefixtures("same_session")
class TestNormalReadsStayClean:
    @pytest.mark.asyncio
    async def test_detail_has_no_private_values_and_no_reveal_history(
        self, db: AsyncSession, test_user: User, test_org: Organization, storage: MagicMock,
    ) -> None:
        applicant = await _applicant(db, test_user, test_org)
        await applicant_sensitive_service.reveal(test_org.id, test_user.id, applicant.id)

        detail = await applicant_service.get_applicant(test_org.id, test_user.id, applicant.id)

        body = detail.model_dump_json()
        for private in ("1990-01-15", "Blue Subaru", "jane@example.com", "555-010-2030",
                        "ref@example.com", "screening/a/b.pdf", "Credit score below threshold"):
            assert private not in body
        assert detail.has_contact_email is True
        assert detail.screening_results[0].has_report is True
        assert detail.events == []

    @pytest.mark.asyncio
    async def test_screening_list_has_no_report_details(
        self, db: AsyncSession, test_user: User, test_org: Organization, storage: MagicMock,
    ) -> None:
        applicant = await _applicant(db, test_user, test_org)

        results = await screening_service.list_results(
            organization_id=test_org.id, user_id=test_user.id, applicant_id=applicant.id,
        )

        assert "screening/a/b.pdf" not in results[0].model_dump_json()
        assert results[0].has_report is True
        storage.generate_presigned_url.assert_not_called()


class TestRevealRoute:
    @pytest.fixture
    def member(self) -> None:
        app.dependency_overrides[current_org_member] = lambda: RequestContext(
            organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.VIEWER,
        )
        yield
        app.dependency_overrides.clear()

    @pytest.mark.usefixtures("member")
    def test_viewers_get_details_never_cached_and_never_the_storage_key(self) -> None:
        details = ApplicantSensitiveResponse(
            dob="1990-01-15",
            references=[ReferenceContactResponse(id=uuid.uuid4(), reference_contact="r@example.com")],
            screening_reports=[ScreeningReportResponse(
                id=uuid.uuid4(), report_storage_key="screening/a/b.pdf",
                presigned_url="https://storage.example/signed",
            )],
        )
        with patch(
            "app.api.applicants.applicant_sensitive_service.reveal",
            new=AsyncMock(return_value=details),
        ):
            response = TestClient(app).post(f"/applicants/{uuid.uuid4()}/sensitive")

        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert response.json()["dob"] == "1990-01-15"
        assert "screening/a/b.pdf" not in response.text

    @pytest.mark.usefixtures("member")
    def test_unknown_applicant_is_404(self) -> None:
        with patch(
            "app.api.applicants.applicant_sensitive_service.reveal",
            new=AsyncMock(side_effect=LookupError("nope")),
        ):
            response = TestClient(app).post(f"/applicants/{uuid.uuid4()}/sensitive")

        assert response.status_code == 404

    def test_too_many_reveals_are_refused(self) -> None:
        context = RequestContext(
            organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER,
        )
        app.dependency_overrides[current_org_member] = lambda: context
        service = AsyncMock(return_value=ApplicantSensitiveResponse())
        try:
            with (
                patch("app.api.applicants.reveal_limiter", RateLimiter(1, 3600)),
                patch("app.api.applicants.applicant_sensitive_service.reveal", new=service),
            ):
                client = TestClient(app)
                client.post(f"/applicants/{uuid.uuid4()}/sensitive")
                response = client.post(f"/applicants/{uuid.uuid4()}/sensitive")
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 429
        assert service.await_count == 1

    def test_requires_sign_in(self) -> None:
        response = TestClient(app).post(f"/applicants/{uuid.uuid4()}/sensitive")

        assert response.status_code == 401
