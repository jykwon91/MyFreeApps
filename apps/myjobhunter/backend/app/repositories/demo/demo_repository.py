"""Repository for demo-account management.

Owns every DB query the demo-management service needs. Per the layered
architecture rule, services and routes never touch the ORM directly —
this module is the single seam between demo orchestration and the
database.

What's HERE:

  - User lookups by email / id with the ``is_demo`` filter applied
    where appropriate (so a real user is never returned by a demo
    listing or accidentally reachable from the demo delete endpoint).
  - Bulk-insert helpers for the seeded data domains: profile,
    work history, education, skills, companies, applications,
    application events, and the resume_upload_job stub.

What's NOT here:

  - Password hashing or fastapi-users plumbing — that lives in the
    service layer because it depends on ``UserManager`` /
    ``PasswordHelper`` which are not DB primitives.
  - Email-uniqueness validation — the service decides what error to
    raise when a collision happens; the repo just inserts and lets
    SQLAlchemy bubble the IntegrityError if it occurs.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company
from app.models.jobs.resume_upload_job import ResumeUploadJob
from app.models.profile.education import Education
from app.models.profile.profile import Profile
from app.models.profile.skill import Skill
from app.models.profile.work_history import WorkHistory
from app.models.user.user import User
from app.services.demo.demo_constants import (
    ApplicationSeed,
    CompanySeed,
    EducationSeed,
    ProfileSeed,
    SkillSeed,
    WorkHistorySeed,
    days_ago,
)


# ---------------------------------------------------------------------------
# User reads
# ---------------------------------------------------------------------------


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Return the user with the given email regardless of ``is_demo``.

    Used at create-time to detect collisions. Email comparison is
    exact — fastapi-users normalizes emails to lowercase at write time
    so callers should pre-lower if they want case-insensitive lookup.
    """
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_demo_user_by_id(
    db: AsyncSession, user_id: uuid.UUID,
) -> User | None:
    """Return the user with ``user_id`` ONLY if ``is_demo=True``.

    Returning ``None`` for a non-demo user is a deliberate safety —
    the admin demo-delete endpoint translates ``None`` into a 404 so a
    bug or malicious request can never destroy a real user account
    via ``/admin/demo/users/{id}``.
    """
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_demo.is_(True))
    )
    return result.scalar_one_or_none()


async def list_demo_user_summaries(db: AsyncSession) -> list[dict]:
    """Return a list of dicts shaped for ``DemoUserSummary``.

    Each dict carries ``user_id``, ``email``, ``display_name``,
    ``created_at``, ``application_count``, ``company_count``.
    Application counts use ``Application.deleted_at IS NULL`` so a
    soft-deleted application is not counted.
    """
    user_result = await db.execute(
        select(User)
        .where(User.is_demo.is_(True))
        .order_by(User.id.desc())
    )
    users = list(user_result.scalars().all())

    summaries: list[dict] = []
    for user in users:
        app_count_result = await db.execute(
            select(func.count())
            .select_from(Application)
            .where(
                Application.user_id == user.id,
                Application.deleted_at.is_(None),
            )
        )
        company_count_result = await db.execute(
            select(func.count())
            .select_from(Company)
            .where(Company.user_id == user.id)
        )
        summaries.append(
            {
                "user_id": user.id,
                "email": user.email,
                "display_name": user.display_name or "",
                "created_at": _user_created_at(user),
                "application_count": app_count_result.scalar_one(),
                "company_count": company_count_result.scalar_one(),
            }
        )
    return summaries


def _user_created_at(user: User) -> datetime:
    """Best-effort created_at for the user row.

    fastapi-users' base table doesn't expose ``created_at`` so we fall
    back to a synthetic "now" if no attribute is present. Real demo
    rows would have a created_at if MJH adds it later — this stub
    keeps the response schema contract intact regardless.
    """
    candidate = getattr(user, "created_at", None)
    if isinstance(candidate, datetime):
        return candidate
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# User writes
# ---------------------------------------------------------------------------


async def create_demo_user(
    db: AsyncSession,
    *,
    email: str,
    hashed_password: str,
    display_name: str,
) -> User:
    """Insert a new demo user row.

    The user is marked verified (``is_verified=True``) so the operator
    can log in immediately without going through the email-verification
    flow — demo accounts are an internal showcase tool, not a real
    sign-up. ``role`` stays as the default USER; demo accounts do not
    grant admin powers.
    """
    user = User(
        email=email,
        hashed_password=hashed_password,
        display_name=display_name,
        is_active=True,
        is_verified=True,
        is_superuser=False,
        is_demo=True,
    )
    db.add(user)
    await db.flush()
    return user


# ---------------------------------------------------------------------------
# Profile + dependent rows
# ---------------------------------------------------------------------------


async def create_profile(
    db: AsyncSession, *, user_id: uuid.UUID, seed: ProfileSeed,
) -> Profile:
    """Insert the user's ``profiles`` row from the seed dict."""
    profile = Profile(
        user_id=user_id,
        summary=seed["summary"],
        work_auth_status=seed["work_auth_status"],
        desired_salary_min=seed["desired_salary_min"],
        desired_salary_max=seed["desired_salary_max"],
        salary_currency=seed["salary_currency"],
        salary_period=seed["salary_period"],
        locations=list(seed["locations"]),
        remote_preference=seed["remote_preference"],
        seniority=seed["seniority"],
        timezone=seed["timezone"],
    )
    db.add(profile)
    await db.flush()
    return profile


async def create_work_history(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
    seeds: list[WorkHistorySeed],
) -> list[WorkHistory]:
    """Insert all WorkHistory rows for the demo profile."""
    rows: list[WorkHistory] = []
    for seed in seeds:
        row = WorkHistory(
            user_id=user_id,
            profile_id=profile_id,
            company_name=seed["company_name"],
            title=seed["title"],
            start_date=seed["start_date"],
            end_date=seed["end_date"],
            bullets=list(seed["bullets"]),
        )
        db.add(row)
        rows.append(row)
    await db.flush()
    return rows


async def create_education(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
    seeds: list[EducationSeed],
) -> list[Education]:
    """Insert all Education rows for the demo profile."""
    rows: list[Education] = []
    for seed in seeds:
        row = Education(
            user_id=user_id,
            profile_id=profile_id,
            school=seed["school"],
            degree=seed["degree"],
            field=seed["field"],
            start_year=seed["start_year"],
            end_year=seed["end_year"],
            gpa=seed["gpa"],
        )
        db.add(row)
        rows.append(row)
    await db.flush()
    return rows


async def create_skills(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
    seeds: list[SkillSeed],
) -> list[Skill]:
    """Insert all Skill rows for the demo profile."""
    rows: list[Skill] = []
    for seed in seeds:
        row = Skill(
            user_id=user_id,
            profile_id=profile_id,
            name=seed["name"],
            years_experience=seed["years_experience"],
            category=seed["category"],
        )
        db.add(row)
        rows.append(row)
    await db.flush()
    return rows


async def create_resume_upload_job(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
    file_path: str,
    file_filename: str,
    file_content_type: str,
    parsed_fields: dict,
    parser_version: str,
) -> ResumeUploadJob:
    """Insert a complete ``resume_upload_jobs`` row for the demo profile.

    Status is hard-set to ``complete`` with both ``started_at`` and
    ``completed_at`` populated so the Profile page's upload-history
    surface renders an immediately-finished job.
    """
    now = datetime.now(timezone.utc)
    started = now - _DEMO_RESUME_PARSE_DURATION
    job = ResumeUploadJob(
        user_id=user_id,
        profile_id=profile_id,
        file_path=file_path,
        file_filename=file_filename,
        file_content_type=file_content_type,
        file_size_bytes=_DEMO_RESUME_FAKE_BYTES,
        status="complete",
        retry_count=0,
        result_parsed_fields=parsed_fields,
        parser_version=parser_version,
        started_at=started,
        completed_at=now,
    )
    db.add(job)
    await db.flush()
    return job


# Constants kept module-private — only the demo repo seeds these
# specific values. Centralised here so a future tweak (e.g. faster
# parse simulation) is one diff.

_DEMO_RESUME_PARSE_DURATION = timedelta(seconds=15)
_DEMO_RESUME_FAKE_BYTES = 184_320  # 180 KB-ish — plausible PDF size
_DEMO_PARSER_VERSION = "demo-seed-v1"


# ---------------------------------------------------------------------------
# Companies + applications
# ---------------------------------------------------------------------------


async def create_companies(
    db: AsyncSession, *, user_id: uuid.UUID, seeds: list[CompanySeed],
) -> list[Company]:
    """Insert all Company rows for the demo user."""
    rows: list[Company] = []
    for seed in seeds:
        row = Company(
            user_id=user_id,
            name=seed["name"],
            primary_domain=seed["primary_domain"],
            industry=seed["industry"],
            size_range=seed["size_range"],
            hq_location=seed["hq_location"],
            description=seed["description"],
        )
        db.add(row)
        rows.append(row)
    await db.flush()
    return rows


async def create_applications_with_events(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    company_ids: list[uuid.UUID],
    seeds: list[ApplicationSeed],
) -> list[Application]:
    """Insert demo applications + their event timeline.

    For each application seed the repo:
      1. Inserts an ``applications`` row with ``applied_at`` resolved
         from the seed's ``days_ago_applied`` offset.
      2. Inserts each event from ``seed['events']`` against that
         application, with ``occurred_at`` resolved from the
         (applied_at + days_after_applied) offset and ``source``
         hard-set to ``'manual'`` so the events look like operator-
         logged entries.

    Tenant-scoping is honoured on both rows. Returns the list of
    inserted Applications in seed order so callers can introspect
    counts.
    """
    apps: list[Application] = []
    for seed in seeds:
        applied_at = days_ago(seed["days_ago_applied"])
        app = Application(
            user_id=user_id,
            company_id=company_ids[seed["company_index"]],
            role_title=seed["role_title"],
            location=seed["location"],
            remote_type=seed["remote_type"],
            source=seed["source"],
            posted_salary_min=seed["posted_salary_min"],
            posted_salary_max=seed["posted_salary_max"],
            posted_salary_currency="USD",
            posted_salary_period="annual",
            fit_score=seed["fit_score"],
            notes=seed["notes"],
            applied_at=applied_at,
            archived=False,
        )
        db.add(app)
        await db.flush()
        apps.append(app)

        for event_type, days_after in seed["events"]:
            event = ApplicationEvent(
                user_id=user_id,
                application_id=app.id,
                event_type=event_type,
                # Anchored on applied_at so the timeline reads in order.
                occurred_at=applied_at + timedelta(days=days_after),
                source="manual",
            )
            db.add(event)
    await db.flush()
    return apps


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------


async def delete_demo_user_cascade(
    db: AsyncSession, *, user_id: uuid.UUID,
) -> None:
    """Hard-delete the demo user and ALL their cascade-able rows.

    Because every domain table has ``ON DELETE CASCADE`` on its
    ``user_id`` FK, a single ``DELETE FROM users WHERE id = :id``
    cleans up applications, application_events, application_contacts,
    documents, companies, profiles, work_history, education, skills,
    screening_answers, resume_upload_jobs, and resume refinement
    tables in one shot. Auth-event rows persist intentionally —
    ``auth_events.user_id`` has no FK so the audit trail survives.

    The function double-checks ``is_demo=True`` at the SQL layer (in
    addition to the service-layer check) so a bug elsewhere can never
    trigger a real-user wipe via this function.
    """
    await db.execute(
        delete(User).where(User.id == user_id, User.is_demo.is_(True))
    )
