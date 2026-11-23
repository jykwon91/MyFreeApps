"""Background jobs that act for one user are audited as that user.

The worker processes and the discovery scheduler run outside any request, so
nothing sets the audit actor for them. Without ``audit_actor`` their writes are
audited with ``changed_by`` NULL: unattributable, and left behind when the user
deletes their account (the erasure finds a user's history by ``changed_by``).
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.core.audit import current_user_id
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audit_erasure import audit_listener_attached
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AUDIT_CONFIG
from app.models.resume_refinement.session import ResumeRefinementSession
from app.services.discovery import discovery_scheduler_service
from app.services.resume_refinement import session_lifecycle_service
from app.workers import resume_parser_worker
from app.workers.refinement_prepare_worker import process_one_session


@dataclass
class _ClaimedJob:
    id: uuid.UUID
    user_id: uuid.UUID
    profile_id: uuid.UUID
    file_path: str
    file_content_type: str
    started_at: datetime


@dataclass
class _Source:
    user_id: uuid.UUID
    is_active: bool = True


@asynccontextmanager
async def _no_session() -> AsyncIterator[object]:
    yield object()


@pytest.mark.asyncio
async def test_refinement_preparation_writes_are_audited_as_the_sessions_user(
    db: AsyncSession, user_factory,
) -> None:
    user = await user_factory()
    session = ResumeRefinementSession(
        user_id=uuid.UUID(user["id"]), status="preparing", current_draft="My draft",
    )
    db.add(session)
    await db.commit()

    with (
        audit_listener_attached(AUDIT_CONFIG),
        patch.object(session_lifecycle_service, "prepare_session", new=AsyncMock(side_effect=RuntimeError("boom"))),
    ):
        assert await process_one_session() is True

    updates = (await db.execute(
        select(AuditLog).where(
            AuditLog.table_name == "resume_refinement_sessions",
            AuditLog.record_id == str(session.id),
            AuditLog.operation == "UPDATE",
        ),
    )).scalars().all()
    assert "status" in {row.field_name for row in updates}
    assert {row.changed_by for row in updates} == {user["id"]}
    assert current_user_id.get() is None


@pytest.mark.asyncio
async def test_resume_parsing_runs_as_the_jobs_user() -> None:
    job = _ClaimedJob(
        id=uuid.uuid4(), user_id=uuid.uuid4(), profile_id=uuid.uuid4(),
        file_path="resumes/a.pdf", file_content_type="application/pdf",
        started_at=datetime.now(UTC),
    )
    actors: list[str | None] = []

    async def _extract(**_: object) -> bool:
        actors.append(current_user_id.get())
        return False

    with (
        patch.object(resume_parser_worker, "AsyncSessionLocal", _no_session),
        patch.object(resume_parser_worker.resume_upload_job_repo, "claim_next_queued", AsyncMock(return_value=job)),
        patch.object(resume_parser_worker, "_run_extraction", side_effect=_extract),
    ):
        assert await resume_parser_worker.process_one() is True

    assert actors == [str(job.user_id)]
    assert current_user_id.get() is None


@pytest.mark.asyncio
async def test_a_scheduled_discovery_fetch_runs_as_the_sources_owner() -> None:
    source_id, user_id = uuid.uuid4(), uuid.uuid4()
    actors: list[str | None] = []

    async def _record(*_: object, **__: object) -> dict[str, int]:
        actors.append(current_user_id.get())
        return {"new_count": 1}

    with (
        patch.object(discovery_scheduler_service, "AsyncSessionLocal", _no_session),
        patch.object(
            discovery_scheduler_service.discovery_schedule_repository, "get_source_for_scheduler",
            AsyncMock(return_value=_Source(user_id=user_id)),
        ),
        patch.object(discovery_scheduler_service.discovery_fetch_service, "fetch_source", side_effect=_record),
        patch.object(
            discovery_scheduler_service.discovery_embedding_service, "embed_pending_for_user_background",
            side_effect=_record,
        ),
        patch.object(discovery_scheduler_service.discovery_score_service, "score_user_inbox", side_effect=_record),
    ):
        await discovery_scheduler_service._run_scheduled_fetch(source_id, user_id)

    assert actors == [str(user_id)] * 3
    assert current_user_id.get() is None
