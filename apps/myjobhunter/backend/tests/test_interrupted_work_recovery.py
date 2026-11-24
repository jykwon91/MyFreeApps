"""Work the resume worker was killed in the middle of is put back at boot.

Against a real database. A claimed parse goes back on the queue, due now, with
the attempt counted; past the retry limit it fails with our copy. The same for
a claimed refinement prepare. Unclaimed and finished rows are left alone.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.core.audit import current_user_id
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audit_erasure import audit_listener_attached
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AUDIT_CONFIG
from app.core.job_failure_messages import (
    INTERRUPTED_RETRY_MESSAGE,
    REFINEMENT_PREP_FAILED_MESSAGE,
    RESUME_PARSE_FAILED_MESSAGE,
)
from app.core.refinement_prepare_constants import REFINEMENT_PREP_MAX_RETRIES
from app.core.resume_parse_constants import RESUME_PARSE_MAX_RETRIES
from app.models.jobs.resume_upload_job import ResumeUploadJob
from app.models.profile.profile import Profile
from app.models.resume_refinement.session import ResumeRefinementSession
from app.repositories.jobs import resume_upload_job_repo
from app.repositories.resume_refinement import session_repo
from app.workers.interrupted_work_recovery import recover_interrupted_work

_CLAIMED_AT = datetime.now(timezone.utc) - timedelta(minutes=10)


async def _job(
    db: AsyncSession, user: dict, *, status: str, retry_count: int = 0,
) -> uuid.UUID:
    profile = Profile(user_id=uuid.UUID(user["id"]))
    db.add(profile)
    await db.flush()
    started_at = _CLAIMED_AT if status == "processing" else None
    job = ResumeUploadJob(
        user_id=uuid.UUID(user["id"]),
        profile_id=profile.id,
        file_path=f"resumes/{uuid.uuid4()}/resume.pdf",
        status=status,
        retry_count=retry_count,
        started_at=started_at,
    )
    db.add(job)
    await db.commit()
    return job.id


async def _session(
    db: AsyncSession,
    user: dict,
    *,
    claimed: bool,
    retry_count: int = 0,
    status: str = "preparing",
) -> uuid.UUID:
    claimed_at = _CLAIMED_AT if claimed else None
    session = ResumeRefinementSession(
        user_id=uuid.UUID(user["id"]),
        status=status,
        current_draft="My draft",
        preparation_started_at=claimed_at,
        preparation_retry_count=retry_count,
    )
    db.add(session)
    await db.commit()
    return session.id


async def _reload_job(db: AsyncSession, job_id: uuid.UUID) -> ResumeUploadJob:
    db.expire_all()
    job = await db.get(ResumeUploadJob, job_id)
    assert job is not None
    return job


async def _reload_session(db: AsyncSession, session_id: uuid.UUID) -> ResumeRefinementSession:
    db.expire_all()
    session = await db.get(ResumeRefinementSession, session_id)
    assert session is not None
    return session


@pytest.mark.asyncio
async def test_an_interrupted_parse_is_queued_again_and_due_now(db: AsyncSession, user_factory) -> None:
    job_id = await _job(db, await user_factory(), status="processing")

    await recover_interrupted_work()

    job = await _reload_job(db, job_id)
    assert job.status == "queued"
    assert job.started_at is None
    assert job.retry_count == 1
    assert job.next_retry_at is not None
    assert job.next_retry_at <= datetime.now(timezone.utc)
    assert job.error_message == INTERRUPTED_RETRY_MESSAGE


@pytest.mark.asyncio
async def test_an_interrupted_parse_past_the_retry_limit_fails(db: AsyncSession, user_factory) -> None:
    job_id = await _job(
        db, await user_factory(), status="processing", retry_count=RESUME_PARSE_MAX_RETRIES,
    )

    await recover_interrupted_work()

    job = await _reload_job(db, job_id)
    assert job.status == "failed"
    assert job.error_message == RESUME_PARSE_FAILED_MESSAGE
    assert job.completed_at is not None
    assert job.retry_count == RESUME_PARSE_MAX_RETRIES


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["queued", "complete", "failed"])
async def test_an_unclaimed_job_is_left_alone(db: AsyncSession, user_factory, status: str) -> None:
    job_id = await _job(db, await user_factory(), status=status)

    await recover_interrupted_work()

    job = await _reload_job(db, job_id)
    assert job.status == status
    assert job.retry_count == 0
    assert job.error_message is None


@pytest.mark.asyncio
async def test_an_interrupted_prepare_is_released_and_due_now(db: AsyncSession, user_factory) -> None:
    session_id = await _session(db, await user_factory(), claimed=True)

    await recover_interrupted_work()

    session = await _reload_session(db, session_id)
    assert session.status == "preparing"
    assert session.preparation_started_at is None
    assert session.preparation_retry_count == 1
    assert session.preparation_next_retry_at is not None
    assert session.preparation_next_retry_at <= datetime.now(timezone.utc)
    assert session.error_message == INTERRUPTED_RETRY_MESSAGE


@pytest.mark.asyncio
async def test_an_interrupted_prepare_past_the_retry_limit_fails(db: AsyncSession, user_factory) -> None:
    session_id = await _session(
        db, await user_factory(), claimed=True, retry_count=REFINEMENT_PREP_MAX_RETRIES,
    )

    await recover_interrupted_work()

    session = await _reload_session(db, session_id)
    assert session.status == "failed"
    assert session.error_message == REFINEMENT_PREP_FAILED_MESSAGE


@pytest.mark.asyncio
async def test_an_unclaimed_prepare_is_left_alone(db: AsyncSession, user_factory) -> None:
    session_id = await _session(db, await user_factory(), claimed=False)

    await recover_interrupted_work()

    session = await _reload_session(db, session_id)
    assert session.status == "preparing"
    assert session.preparation_retry_count == 0
    assert session.error_message is None


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["active", "failed"])
async def test_a_finished_prepare_keeps_its_claim_time_and_is_left_alone(
    db: AsyncSession, user_factory, status: str,
) -> None:
    # Finishing a prepare never clears preparation_started_at.
    session_id = await _session(db, await user_factory(), claimed=True, status=status)

    await recover_interrupted_work()

    session = await _reload_session(db, session_id)
    assert session.status == status
    assert session.preparation_retry_count == 0
    assert session.error_message is None


@pytest.mark.asyncio
async def test_a_parse_claimed_again_after_the_list_is_left_to_the_new_claim(
    db: AsyncSession, user_factory,
) -> None:
    job_id = await _job(db, await user_factory(), status="processing")
    job = await _reload_job(db, job_id)
    stale = [
        ResumeUploadJob(
            id=job.id,
            user_id=job.user_id,
            profile_id=job.profile_id,
            file_path=job.file_path,
            started_at=_CLAIMED_AT - timedelta(minutes=1),
        ),
    ]

    with patch.object(resume_upload_job_repo, "list_processing", new=AsyncMock(return_value=stale)):
        await recover_interrupted_work()

    job = await _reload_job(db, job_id)
    assert job.status == "processing"
    assert job.retry_count == 0


@pytest.mark.asyncio
async def test_a_prepare_claimed_again_after_the_list_is_left_to_the_new_claim(
    db: AsyncSession, user_factory,
) -> None:
    session_id = await _session(db, await user_factory(), claimed=True)
    session = await _reload_session(db, session_id)
    stale = [
        ResumeRefinementSession(
            id=session.id,
            user_id=session.user_id,
            preparation_started_at=_CLAIMED_AT - timedelta(minutes=1),
        ),
    ]

    with patch.object(
        session_repo, "list_claimed_preparations", new=AsyncMock(return_value=stale),
    ):
        await recover_interrupted_work()

    session = await _reload_session(db, session_id)
    assert session.preparation_started_at == _CLAIMED_AT
    assert session.preparation_retry_count == 0


@pytest.mark.asyncio
async def test_recovered_prepares_are_audited_as_the_sessions_user(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    session_id = await _session(db, user, claimed=True)

    with audit_listener_attached(AUDIT_CONFIG):
        await recover_interrupted_work()

    updates = (await db.execute(
        select(AuditLog).where(
            AuditLog.table_name == "resume_refinement_sessions",
            AuditLog.record_id == str(session_id),
            AuditLog.operation == "UPDATE",
        ),
    )).scalars().all()
    assert "preparation_retry_count" in {row.field_name for row in updates}
    assert {row.changed_by for row in updates} == {user["id"]}
    assert current_user_id.get() is None
