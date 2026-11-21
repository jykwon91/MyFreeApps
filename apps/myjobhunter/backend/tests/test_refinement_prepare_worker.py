"""The refinement-preparation worker against a real database.

Only ``prepare_session`` is faked. A temporary failure puts the session back
in the queue with a growing wait (so it is not re-claimed straight away),
up to ``REFINEMENT_PREP_MAX_RETRIES``; a permanent one, or running out of
retries, fails the session with our own copy, never the exception's text.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.extraction import AnthropicFailureKind, ExtractionError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai_failure_messages import (
    AI_BUSY_MESSAGE,
    AI_RETRY_SCHEDULED_MESSAGE,
    AI_UNAVAILABLE_MESSAGE,
    AI_UNREADABLE_REPLY_MESSAGE,
)
from app.core.job_failure_messages import REFINEMENT_PREP_FAILED_MESSAGE
from app.core.refinement_prepare_constants import REFINEMENT_PREP_MAX_RETRIES
from app.models.resume_refinement.session import ResumeRefinementSession
from app.services.resume_refinement import session_lifecycle_service
from app.workers.refinement_prepare_worker import process_one_session


def _busy() -> ExtractionError:
    return ExtractionError(
        "Claude is overloaded (provider detail)",
        kind=AnthropicFailureKind.UPSTREAM,
        error_type="overloaded_error",
        status=529,
    )


async def _preparing_session(db: AsyncSession, user_id: str, *, retry_count: int = 0) -> uuid.UUID:
    session = ResumeRefinementSession(
        user_id=uuid.UUID(user_id),
        status="preparing",
        current_draft="My draft",
        preparation_retry_count=retry_count,
    )
    db.add(session)
    await db.commit()
    return session.id


async def _reload(db: AsyncSession, session_id: uuid.UUID) -> ResumeRefinementSession:
    db.expire_all()
    session = await db.get(ResumeRefinementSession, session_id)
    assert session is not None
    return session


async def _prepare_raising(error: Exception) -> None:
    with patch.object(
        session_lifecycle_service, "prepare_session", new=AsyncMock(side_effect=error),
    ):
        assert await process_one_session() is True


@pytest.mark.asyncio
async def test_transient_failure_waits_then_retries(db: AsyncSession, user_factory) -> None:
    user = await user_factory()
    session_id = await _preparing_session(db, user["id"])

    await _prepare_raising(_busy())

    session = await _reload(db, session_id)
    assert session.status == "preparing"
    assert session.preparation_started_at is None
    assert session.preparation_retry_count == 1
    assert session.preparation_next_retry_at is not None
    assert session.preparation_next_retry_at > datetime.now(timezone.utc)
    assert session.error_message == AI_RETRY_SCHEDULED_MESSAGE
    # Waiting out its backoff, so the next poll does not claim it again.
    assert await process_one_session() is False


@pytest.mark.asyncio
async def test_transient_failure_after_the_retry_limit_fails(db: AsyncSession, user_factory) -> None:
    user = await user_factory()
    session_id = await _preparing_session(db, user["id"], retry_count=REFINEMENT_PREP_MAX_RETRIES)

    await _prepare_raising(_busy())

    session = await _reload(db, session_id)
    assert session.status == "failed"
    assert session.error_message == AI_BUSY_MESSAGE


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (
            ExtractionError(
                "invalid x-api-key (provider detail)",
                kind=AnthropicFailureKind.MISCONFIGURED,
                error_type="authentication_error",
                status=401,
            ),
            AI_UNAVAILABLE_MESSAGE,
        ),
        (ValueError("Claude returned invalid JSON: Sure! Here's a critique"), AI_UNREADABLE_REPLY_MESSAGE),
        (RuntimeError("connection to server at 10.0.0.5 port 5432 failed"), REFINEMENT_PREP_FAILED_MESSAGE),
    ],
    ids=["permanent-claude-failure", "unreadable-reply", "internal-error"],
)
@pytest.mark.asyncio
async def test_final_failure_stores_our_copy(
    db: AsyncSession, user_factory, error: Exception, expected: str,
) -> None:
    user = await user_factory()
    session_id = await _preparing_session(db, user["id"])

    await _prepare_raising(error)

    session = await _reload(db, session_id)
    assert session.status == "failed"
    assert session.error_message == expected
    assert session.preparation_retry_count == 0
