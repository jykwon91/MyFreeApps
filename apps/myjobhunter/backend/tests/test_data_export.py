"""Tests for GET /users/me/export (data export endpoint).

Covers:
- Returns the expected top-level keys for all 15 MJH domain tables
- User row is exported with the public fields, not the secrets
- Excludes hashed_password, totp_secret_encrypted, totp_recovery_codes,
  job_board_credentials.encrypted_credentials
- Tenant-isolated — user A's export does not contain user B's rows
- Emits a ``DATA_EXPORTED`` auth event
- Unauthenticated request → 401
"""
import uuid
from datetime import date, datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.main import app
from app.models.application.application import Application
from app.models.application.application_contact import ApplicationContact
from app.models.application.application_event import ApplicationEvent
from app.models.application.document import Document
from app.models.company.company import Company
from app.models.integration.job_board_credential import JobBoardCredential
from app.models.profile.profile import Profile
from app.models.profile.skill import Skill
from app.models.system.auth_event import AuthEvent
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


EXPECTED_TOP_LEVEL_KEYS: list[str] = [
    "exported_at",
    "user",
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
]


def _make_user(email: str | None = None) -> User:
    return User(
        id=uuid.uuid4(),
        email=email or f"export-{uuid.uuid4().hex[:10]}@example.com",
        hashed_password="$2b$12$fakehashfortestingonly1234",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=False,
        display_name="Export User",
    )


def _override_deps(user: User, db: AsyncSession) -> None:
    async def _override_get_db():
        yield db

    app.dependency_overrides[current_active_user] = lambda: user
    app.dependency_overrides[get_db] = _override_get_db


# ---------------------------------------------------------------------------
# GET /users/me/export — returns expected structure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_returns_expected_top_level_keys(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()

    _override_deps(user, db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/users/me/export")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()

    for key in EXPECTED_TOP_LEVEL_KEYS:
        assert key in data, f"Missing top-level key: {key}"

    assert data["user"]["email"] == user.email
    assert data["user"]["id"] == str(user.id)


@pytest.mark.asyncio
async def test_export_returns_user_data(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()

    profile = Profile(user_id=user.id, summary="Backend engineer")
    db.add(profile)
    await db.flush()

    skill = Skill(user_id=user.id, profile_id=profile.id, name="python", years_experience=8)
    db.add(skill)

    company = Company(user_id=user.id, name="Acme Co", primary_domain="acme.com")
    db.add(company)
    await db.flush()

    application = Application(user_id=user.id, company_id=company.id, role_title="Senior Engineer")
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
        name="Recruiter",
        role="recruiter",
    ))
    db.add(Document(
        user_id=user.id,
        application_id=application.id,
        title="Cover letter",
        kind="cover_letter",
        file_path="/tmp/cover.pdf",
    ))
    await db.flush()

    _override_deps(user, db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/users/me/export")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()

    assert len(data["profiles"]) == 1
    assert data["profiles"][0]["summary"] == "Backend engineer"
    assert len(data["skills"]) == 1
    assert data["skills"][0]["name"] == "python"
    assert data["skills"][0]["years_experience"] == 8
    assert len(data["companies"]) == 1
    assert data["companies"][0]["name"] == "Acme Co"
    assert len(data["applications"]) == 1
    assert data["applications"][0]["role_title"] == "Senior Engineer"
    assert len(data["application_events"]) == 1
    assert len(data["application_contacts"]) == 1
    assert len(data["documents"]) == 1


# ---------------------------------------------------------------------------
# GET /users/me/export — excludes secrets
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_excludes_user_secrets(db: AsyncSession) -> None:
    user = _make_user()
    user.totp_secret_encrypted = "FAKE_ENCRYPTED_SECRET_BLOB"
    user.totp_recovery_codes = "FAKE_ENCRYPTED_RECOVERY_BLOB"
    db.add(user)
    await db.flush()

    _override_deps(user, db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/users/me/export")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    raw_body = response.text

    # Field names must not appear in the JSON payload.
    assert "hashed_password" not in raw_body
    assert "totp_secret" not in raw_body
    assert "totp_recovery_codes" not in raw_body
    # Field values must not appear either.
    assert "FAKE_ENCRYPTED_SECRET_BLOB" not in raw_body
    assert "FAKE_ENCRYPTED_RECOVERY_BLOB" not in raw_body
    assert "$2b$12$" not in raw_body


@pytest.mark.asyncio
async def test_export_excludes_job_board_encrypted_credentials(db: AsyncSession) -> None:
    user = _make_user()
    db.add(user)
    await db.flush()

    db.add(JobBoardCredential(
        user_id=user.id,
        board="linkedin",
        encrypted_credentials=b"super-secret-ciphertext",
        key_version=1,
    ))
    await db.flush()

    _override_deps(user, db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/users/me/export")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    raw_body = response.text

    assert len(data["job_board_credentials"]) == 1
    cred = data["job_board_credentials"][0]
    # Only the safe metadata fields are present.
    assert cred["board"] == "linkedin"
    assert "id" in cred
    # Sensitive fields explicitly absent.
    assert "encrypted_credentials" not in cred
    assert "key_version" not in cred
    # The ciphertext bytes never appear in the JSON.
    assert "super-secret-ciphertext" not in raw_body


# ---------------------------------------------------------------------------
# GET /users/me/export — tenant isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_only_returns_own_data(db: AsyncSession) -> None:
    suffix = uuid.uuid4().hex[:8]
    user_a = _make_user(email=f"user-a-{suffix}@example.com")
    user_b = _make_user(email=f"user-b-{suffix}@example.com")
    db.add(user_a)
    db.add(user_b)
    await db.flush()

    company_b = Company(user_id=user_b.id, name="UserB Inc")
    db.add(company_b)
    await db.flush()

    db.add(Application(
        user_id=user_b.id,
        company_id=company_b.id,
        role_title="UserB-only role",
    ))
    await db.flush()

    _override_deps(user_a, db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/users/me/export")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["user"]["id"] == str(user_a.id)
    assert data["companies"] == []
    assert data["applications"] == []


# ---------------------------------------------------------------------------
# GET /users/me/export — emits DATA_EXPORTED auth event
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_writes_data_exported_auth_event(db: AsyncSession) -> None:
    user = _make_user(email=f"audit-export-{uuid.uuid4().hex[:8]}@example.com")
    db.add(user)
    await db.flush()

    _override_deps(user, db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/users/me/export")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200

    event_rows = (
        await db.execute(
            select(AuthEvent).where(
                AuthEvent.user_id == user.id,
                AuthEvent.event_type == "data.exported",
            )
        )
    ).scalars().all()
    assert len(event_rows) == 1
    assert event_rows[0].succeeded is True


# ---------------------------------------------------------------------------
# GET /users/me/export — unauthenticated
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unauthenticated_export_blocked() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/users/me/export")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /users/me/export — JSON is well-formed and contains a Content-Disposition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_response_is_attachment(db: AsyncSession) -> None:
    user = _make_user(email=f"attachment-{uuid.uuid4().hex[:8]}@example.com")
    db.add(user)
    await db.flush()

    _override_deps(user, db)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/users/me/export")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    disposition = response.headers.get("content-disposition", "")
    assert "attachment" in disposition
    assert "myjobhunter-export-" in disposition
    assert disposition.endswith(".json")
