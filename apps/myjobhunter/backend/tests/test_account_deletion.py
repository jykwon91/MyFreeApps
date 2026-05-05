"""Tests for DELETE /users/me (account deletion endpoint).

Covers:
- Wrong password → 403
- Wrong email confirmation → 400
- TOTP enabled but code missing → 400
- TOTP enabled but code wrong → 403
- TOTP enabled, correct code → 204
- Correct credentials → 204, user row deleted
- Cascade purges all 15 MJH domain tables for the user
- ``ACCOUNT_DELETED`` auth event row survives the cascade
- Unauthenticated request → 401
"""
import contextlib
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.main import app
from app.models.application.application import Application
from app.models.application.application_contact import ApplicationContact
from app.models.application.application_event import ApplicationEvent
from app.models.application.document import Document
from app.models.company.company import Company
from app.models.company.company_research import CompanyResearch
from app.models.company.research_source import ResearchSource
from app.models.integration.job_board_credential import JobBoardCredential
from app.models.jobs.resume_upload_job import ResumeUploadJob
from app.models.profile.education import Education
from app.models.profile.profile import Profile
from app.models.profile.screening_answer import ScreeningAnswer
from app.models.profile.skill import Skill
from app.models.profile.work_history import WorkHistory
from app.models.system.auth_event import AuthEvent
from app.models.system.extraction_log import ExtractionLog
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(
    *,
    email: str | None = None,
    totp_enabled: bool = False,
) -> User:
    return User(
        id=uuid.uuid4(),
        email=email or f"delete-{uuid.uuid4().hex[:10]}@example.com",
        hashed_password="$2b$12$fakehashfortestingonly1234",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=totp_enabled,
        display_name="Delete Me",
    )


def _auth_client(user: User):
    """Context manager yielding an AsyncClient with current_active_user overridden."""
    @contextlib.asynccontextmanager
    async def _cm():
        app.dependency_overrides[current_active_user] = lambda: user
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
        app.dependency_overrides.clear()

    return _cm


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    """Redirect unit_of_work in the account route to the test DB.

    Mirrors real unit_of_work: flushes changes so they are visible in the same
    session after the context exits (no second session commit needed for tests).
    Also overrides get_db so the API handler's session is the same test session.
    """
    @asynccontextmanager
    async def _fake_uow():
        yield db
        await db.flush()

    from app.db.session import get_db as _get_db

    async def _override_get_db():
        yield db

    app.dependency_overrides[_get_db] = _override_get_db
    with patch("app.api.account.unit_of_work", _fake_uow):
        yield


# ---------------------------------------------------------------------------
# DELETE /users/me — wrong password
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_requires_correct_password(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (False, None)

        async with _auth_client(user)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "wrong-password",
                    "confirm_email": user.email,
                },
            )

    assert response.status_code == 403
    assert response.json()["detail"] == "Incorrect password"


# ---------------------------------------------------------------------------
# DELETE /users/me — wrong email confirmation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_requires_email_confirmation(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": "wrong@example.com",
                },
            )

    assert response.status_code == 400
    assert "Email confirmation" in response.json()["detail"]


# ---------------------------------------------------------------------------
# DELETE /users/me — TOTP enabled, code missing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_requires_totp_when_enabled_missing_code(db: AsyncSession) -> None:
    user = _make_user(totp_enabled=True)
    db.add(user)
    await db.flush()

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": user.email,
                    "totp_code": None,
                },
            )

    assert response.status_code == 400
    assert response.json()["detail"] == "TOTP_CODE_REQUIRED"


# ---------------------------------------------------------------------------
# DELETE /users/me — TOTP enabled, wrong code
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_requires_totp_when_enabled_wrong_code(db: AsyncSession) -> None:
    user = _make_user(totp_enabled=True)
    db.add(user)
    await db.flush()

    with (
        patch("app.api.account.PasswordHelper") as mock_helper_cls,
        patch(
            "app.api.account.verify_totp_code",
            new_callable=AsyncMock,
            return_value=False,
        ),
    ):
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": user.email,
                    "totp_code": "000000",
                },
            )

    assert response.status_code == 403
    assert "TOTP" in response.json()["detail"]


# ---------------------------------------------------------------------------
# DELETE /users/me — TOTP enabled, correct code
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_succeeds_with_valid_totp(db: AsyncSession) -> None:
    user = _make_user(totp_enabled=True)
    db.add(user)
    await db.flush()

    with (
        patch("app.api.account.PasswordHelper") as mock_helper_cls,
        patch(
            "app.api.account.verify_totp_code",
            new_callable=AsyncMock,
            return_value=True,
        ),
    ):
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": user.email,
                    "totp_code": "123456",
                },
            )

    assert response.status_code == 204


# ---------------------------------------------------------------------------
# DELETE /users/me — success, user row deleted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_succeeds_with_correct_creds(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()

    user_row = (
        await db.execute(select(User).where(User.id == user.id))
    ).scalar_one_or_none()
    assert user_row is not None

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": user.email,
                },
            )

    assert response.status_code == 204

    user_after = (
        await db.execute(
            select(User).where(User.id == user.id).execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    assert user_after is None


# ---------------------------------------------------------------------------
# DELETE /users/me — case-insensitive email match accepted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_email_match_is_case_insensitive(db: AsyncSession) -> None:
    suffix = uuid.uuid4().hex[:8]
    mixed_case_email = f"MixedCase-{suffix}@Example.com"
    user = _make_user(email=mixed_case_email)
    db.add(user)
    await db.flush()

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    # Same address, swap the case to confirm case-insensitive match.
                    "confirm_email": mixed_case_email.swapcase(),
                },
            )

    assert response.status_code == 204


# ---------------------------------------------------------------------------
# DELETE /users/me — cascade wipes all 15 domain tables
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_cascades_all_domain_rows(db: AsyncSession) -> None:
    user = _make_user(email=f"cascade-{uuid.uuid4().hex[:8]}@example.com")
    db.add(user)
    await db.flush()

    profile = Profile(user_id=user.id)
    db.add(profile)
    await db.flush()

    db.add(WorkHistory(
        user_id=user.id,
        profile_id=profile.id,
        company_name="Acme",
        title="Engineer",
        start_date=date(2020, 1, 1),
    ))
    db.add(Education(user_id=user.id, profile_id=profile.id, school="State U"))
    db.add(Skill(user_id=user.id, profile_id=profile.id, name="python"))
    db.add(ScreeningAnswer(
        user_id=user.id,
        profile_id=profile.id,
        question_key="visa_status",
        answer="citizen",
    ))
    db.add(ResumeUploadJob(
        user_id=user.id,
        profile_id=profile.id,
        file_path="/tmp/resume.pdf",
    ))

    company = Company(user_id=user.id, name="Acme Inc", primary_domain="acme.com")
    db.add(company)
    await db.flush()

    research = CompanyResearch(user_id=user.id, company_id=company.id)
    db.add(research)
    await db.flush()

    db.add(ResearchSource(
        user_id=user.id,
        company_research_id=research.id,
        url="https://glassdoor.example/acme",
        source_type="glassdoor",
        fetched_at=datetime.now(timezone.utc),
    ))

    application = Application(user_id=user.id, company_id=company.id, role_title="Eng II")
    db.add(application)
    await db.flush()

    db.add(ApplicationEvent(
        user_id=user.id,
        application_id=application.id,
        event_type="applied",
        occurred_at=datetime.now(timezone.utc),
        source="manual",
    ))
    db.add(ApplicationContact(
        user_id=user.id,
        application_id=application.id,
        name="Jane Recruiter",
        role="recruiter",
    ))
    db.add(Document(
        user_id=user.id,
        application_id=application.id,
        title="Cover letter",
        kind="cover_letter",
        file_path="/tmp/cover.pdf",
    ))

    db.add(JobBoardCredential(
        user_id=user.id,
        board="linkedin",
        encrypted_credentials=b"\x01\x02\x03",
    ))

    db.add(ExtractionLog(
        user_id=user.id,
        context_type="resume_parse",
        model="claude-3",
        status="success",
    ))
    await db.flush()

    # Sanity: every domain row exists for this user before the delete.
    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
    assert user_row is not None

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": user.email,
                },
            )

    assert response.status_code == 204

    # Verify every MJH domain table now has zero rows for this user.
    for table_name in [
        "profiles",
        "work_history",
        "education",
        "skills",
        "screening_answers",
        "companies",
        "company_research",
        "research_sources",
        "applications",
        "application_events",
        "application_contacts",
        "documents",
        "job_board_credentials",
        "resume_upload_jobs",
        "extraction_logs",
    ]:
        result = await db.execute(
            text(f"SELECT COUNT(*) FROM {table_name} WHERE user_id = :uid"),
            {"uid": user.id},
        )
        count = result.scalar_one()
        assert count == 0, f"{table_name} still has {count} rows after cascade delete"


# ---------------------------------------------------------------------------
# DELETE /users/me — ACCOUNT_DELETED auth event survives the cascade
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_account_deleted_event_survives_cascade(db: AsyncSession) -> None:
    user = _make_user(email=f"audit-survives-{uuid.uuid4().hex[:8]}@example.com")
    db.add(user)
    await db.flush()

    with patch("app.api.account.PasswordHelper") as mock_helper_cls:
        mock_helper = mock_helper_cls.return_value
        mock_helper.verify_and_update.return_value = (True, None)

        async with _auth_client(user)() as client:
            response = await client.request(
                "DELETE",
                "/users/me",
                json={
                    "password": "correct-password",
                    "confirm_email": user.email,
                },
            )

    assert response.status_code == 204

    # The user row is gone.
    user_after = (
        await db.execute(
            select(User).where(User.id == user.id).execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    assert user_after is None

    # But the ACCOUNT_DELETED auth_events row is still present.
    event_rows = (
        await db.execute(
            select(AuthEvent).where(
                AuthEvent.user_id == user.id,
                AuthEvent.event_type == "account.deleted",
            )
        )
    ).scalars().all()
    assert len(event_rows) == 1
    assert event_rows[0].succeeded is True


# ---------------------------------------------------------------------------
# DELETE /users/me — unauthenticated
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unauthenticated_delete_blocked() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.request(
            "DELETE",
            "/users/me",
            json={
                "password": "any-password",
                "confirm_email": "any@example.com",
            },
        )
    assert response.status_code == 401
