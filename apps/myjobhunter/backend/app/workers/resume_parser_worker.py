"""Resume parser worker — polling loop.

Run with:
    python -m app.workers.resume_parser_worker

Polls ``resume_upload_jobs`` for queued rows every ``POLL_INTERVAL_SECONDS``.
For each queued job:
  1. Atomically claim it (queued → processing) via UPDATE ... RETURNING.
  2. Download the resume bytes from MinIO.
  3. Extract plain text (PDF / DOCX / TXT).
  4. Call Claude with the resume extraction prompt.
  5. Map the JSON response to WorkHistory / Education / Skill rows.
  6. Bulk-insert the profile rows (skills via ON CONFLICT DO NOTHING).
  7. Mark the job ``complete`` with the raw Claude response + parser version.

On any failure: mark the job ``failed`` with ``error_message=str(exc)[:1000]``.
Idempotency: the atomic UPDATE in step 1 ensures only one worker instance
processes a given job, even when multiple replicas run concurrently.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import anthropic
import sqlalchemy.exc

from app.db.session import AsyncSessionLocal
from app.mappers.resume_mapper import map_education, map_skills, map_work_history
from app.repositories.jobs import resume_upload_job_repo
from app.services.extraction.claude_service import extract_resume
from app.services.jobs.resume_text_extractor import (
    ResumeTextExtractionFailed,
    extract_text,
)

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 5
PARSER_VERSION = "2026-05-04-v1"

# Transient errors trigger a retry on the next poll rather than
# permanent failure. Everything else marks the job ``failed``.
_TRANSIENT_ERROR_TYPES = (
    anthropic.RateLimitError,
    asyncio.TimeoutError,
    ConnectionError,
    TimeoutError,
)


def _is_transient(exc: Exception) -> bool:
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code >= 500:
        return True
    return isinstance(exc, _TRANSIENT_ERROR_TYPES)


async def process_one() -> bool:
    """Claim and process one queued job.

    Returns True if a job was found, False if the queue is empty.
    """
    async with AsyncSessionLocal() as db:
        job = await resume_upload_job_repo.claim_next_queued(db)
        if job is None:
            return False

        job_id: uuid.UUID = job.id
        user_id: uuid.UUID = job.user_id
        profile_id: uuid.UUID = job.profile_id
        file_path: str = job.file_path
        content_type: str = job.file_content_type or "application/octet-stream"
        filename: str = job.file_filename or "resume"

    logger.info("Processing resume job %s for user %s (%s)", job_id, user_id, filename)

    try:
        await _run_extraction(
            job_id=job_id,
            user_id=user_id,
            profile_id=profile_id,
            file_path=file_path,
            content_type=content_type,
        )
        logger.info("Completed resume job %s", job_id)
    except Exception as exc:
        error_msg = str(exc)[:1000]
        logger.exception("Failed to process resume job %s: %s", job_id, error_msg)

        if _is_transient(exc):
            # Requeue: flip back to queued so the next poll retries.
            async with AsyncSessionLocal() as db:
                job = await resume_upload_job_repo.get_by_id_for_user(db, job_id, user_id)
                if job:
                    job.status = "queued"
                    job.started_at = None
                    job.error_message = f"Transient error — will retry: {error_msg}"
                    await db.commit()
        else:
            async with AsyncSessionLocal() as db:
                job = await resume_upload_job_repo.get_by_id_for_user(db, job_id, user_id)
                if job:
                    await resume_upload_job_repo.mark_failed(db, job, error_msg)

    return True


async def _run_extraction(
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
    file_path: str,
    content_type: str,
) -> None:
    """Download → extract text → call Claude → persist rows → mark complete."""
    from app.core.storage import get_storage  # noqa: PLC0415 — deferred to avoid startup cost

    # 1. Download from MinIO.
    storage = get_storage()
    file_bytes = storage.download_file(file_path)
    logger.debug("Downloaded %d bytes for job %s", len(file_bytes), job_id)

    # 2. Extract plain text.
    text, char_count = extract_text(file_bytes, content_type)
    logger.debug("Extracted %d chars from job %s", char_count, job_id)

    # 3. Call Claude.
    claude_response = await extract_resume(text, user_id, job_id)
    logger.debug("Claude returned %d work_history, %d education, %d skills for job %s",
                 len(claude_response.get("work_history", [])),
                 len(claude_response.get("education", [])),
                 len(claude_response.get("skills", [])),
                 job_id)

    # 4. Map to ORM instances.
    work_entries = map_work_history(
        claude_response.get("work_history") or [], user_id, profile_id,
    )
    edu_entries = map_education(
        claude_response.get("education") or [], user_id, profile_id,
    )
    skill_entries = map_skills(
        claude_response.get("skills") or [], user_id, profile_id,
    )

    # 5. Persist: upsert profile rows + mark complete in one session.
    async with AsyncSessionLocal() as db:
        # Re-fetch the job for update (the claim session is already closed).
        job = await resume_upload_job_repo.get_by_id_for_user(db, job_id, user_id)
        if job is None:
            logger.warning("Job %s disappeared before completion — skipping", job_id)
            return

        # Insert work_history and education rows.
        for entry in work_entries:
            db.add(entry)
        for entry in edu_entries:
            db.add(entry)

        # Skills use ON CONFLICT DO NOTHING for UNIQUE(user_id, lower(name)).
        for skill in skill_entries:
            await _upsert_skill_ignore_conflict(db, skill)

        await db.flush()

        # Mark the job complete.
        await resume_upload_job_repo.mark_complete(
            db,
            job,
            result_parsed_fields=_build_parsed_fields(claude_response),
            parser_version=PARSER_VERSION,
        )

    logger.info(
        "Job %s complete: %d work, %d edu, %d skills",
        job_id, len(work_entries), len(edu_entries), len(skill_entries),
    )


async def _upsert_skill_ignore_conflict(db: Any, skill: Any) -> None:
    """Add a skill row; silently ignore UNIQUE(user_id, lower(name)) violations."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: PLC0415
    from app.models.profile.skill import Skill  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    stmt = pg_insert(Skill).values(
        id=uuid.uuid4(),  # Generate a fresh UUID — ORM default doesn't fire on pg_insert
        user_id=skill.user_id,
        profile_id=skill.profile_id,
        name=skill.name,
        category=skill.category,
        years_experience=skill.years_experience,
        created_at=now,
        updated_at=now,
    ).on_conflict_do_nothing()
    await db.execute(stmt)


def _build_parsed_fields(claude_response: dict) -> dict:
    """Build the JSONB summary stored on the job row for quick UI display."""
    return {
        "summary": claude_response.get("summary"),
        "headline": claude_response.get("headline"),
        "work_history_count": len(claude_response.get("work_history") or []),
        "education_count": len(claude_response.get("education") or []),
        "skills_count": len(claude_response.get("skills") or []),
        "raw": claude_response,
    }


async def main() -> None:
    logger.info(
        "Resume parser worker started — polling every %ds", POLL_INTERVAL_SECONDS,
    )
    while True:
        try:
            found = await process_one()
        except Exception:
            logger.exception("Unexpected error in worker loop")
            found = False

        if not found:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())


if __name__ == "__main__":
    run()
