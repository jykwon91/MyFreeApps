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
  6. Merge the profile rows: work history / education matched against the
     user's existing rows (no duplicates on re-upload), skills via
     ON CONFLICT DO NOTHING.
  7. Mark the job ``complete`` with the raw Claude response + parser version.
  8. When the merge changed what the profile embedding is built from (work
     history rows added or filled, skills added), refresh the embedding so
     Discover scores against the new profile.

On a failure that clears on its own (Claude busy, timed out or unreachable —
the shared ``ExtractionError.kind``): requeue with exponential backoff up to
``RESUME_PARSE_MAX_RETRIES``. Any other failure marks the job ``failed``. A
Claude failure is stored as our own copy, never the provider's error text.
Idempotency: the atomic UPDATE in step 1 ensures only one worker instance
processes a given job, even when multiple replicas run concurrently.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from platform_shared.core import async_storage
from platform_shared.extraction import is_transient_failure
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai_failure_messages import AI_RETRY_SCHEDULED_MESSAGE
from app.core.job_failure_messages import RESUME_PARSE_FAILED_MESSAGE
from app.core.resume_parse_constants import (
    RESUME_PARSE_MAX_RETRIES,
    RESUME_PARSE_RETRY_BASE_SECONDS,
)
from app.core.retry_backoff import next_retry_at
from app.core.storage import get_storage
from app.core.transient_errors import TRANSIENT_WORKER_ERRORS
from app.db.session import AsyncSessionLocal
from app.mappers.resume_mapper import map_education, map_skills, map_work_history
from app.repositories.jobs import resume_upload_job_repo
from app.models.profile.skill import Skill
from app.services.extraction.ai_failure import user_failure_message
from app.services.extraction.claude_service import MAX_TEXT_CHARS, extract_resume
from app.services.jobs.parse_provenance import build_parse_provenance
from app.services.discovery import discovery_embedding_service
from app.services.jobs.resume_text_extractor import (
    ResumeTextExtractionFailed,
    extract_text,
)
from app.services.profile import profile_service
from app.services.profile.resume_profile_merge_service import merge_parsed_profile_rows
from app.workers.refinement_prepare_worker import process_one_session

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 5
PARSER_VERSION = "2026-05-04-v1"


def _failure_message(exc: Exception) -> str:
    """What the job row (and so the UI) says about a failure — never raw
    exception text, except a text-extraction failure, which is already
    written for the user ("the PDF may be image-only or scanned")."""
    if isinstance(exc, ResumeTextExtractionFailed):
        return str(exc)[:1000]
    return user_failure_message(exc, fallback=RESUME_PARSE_FAILED_MESSAGE)


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
        embedding_inputs_changed = await _run_extraction(
            job_id=job_id,
            user_id=user_id,
            profile_id=profile_id,
            file_path=file_path,
            content_type=content_type,
        )
        logger.info("Completed resume job %s", job_id)
    except Exception as exc:
        logger.exception("Failed to process resume job %s", job_id)
        error_msg = _failure_message(exc)

        async with AsyncSessionLocal() as db:
            job = await resume_upload_job_repo.get_by_id_for_user(db, job_id, user_id)
            if (
                job is not None
                and is_transient_failure(exc, extra_transient=TRANSIENT_WORKER_ERRORS)
                and job.retry_count < RESUME_PARSE_MAX_RETRIES
            ):
                await resume_upload_job_repo.schedule_retry(
                    db,
                    job,
                    next_retry_at=next_retry_at(job.retry_count, RESUME_PARSE_RETRY_BASE_SECONDS),
                    error_message=AI_RETRY_SCHEDULED_MESSAGE,
                )
                logger.info(
                    "Resume job %s: transient failure, retry %d at %s",
                    job_id, job.retry_count, job.next_retry_at,
                )
            elif job is not None:
                await resume_upload_job_repo.mark_failed(db, job, error_msg)
    else:
        # Outside the try: the job is already committed as complete, so an
        # embedding error must not requeue it or mark it failed.
        if embedding_inputs_changed:
            async with AsyncSessionLocal() as db:
                await profile_service.refresh_profile_embedding_best_effort(db, user_id)

    return True


async def _run_extraction(
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    profile_id: uuid.UUID,
    file_path: str,
    content_type: str,
) -> bool:
    """Download → extract text → call Claude → persist rows → mark complete.

    Returns True when the merge changed a profile field the discovery
    embedding is built from (work history or skills), so the caller knows
    to refresh it. Education is not part of the embedding.
    """
    # 1. Download from MinIO.
    storage = get_storage()
    file_bytes = await async_storage.download_file(storage, file_path)
    logger.debug("Downloaded %d bytes for job %s", len(file_bytes), job_id)

    # 2. Extract plain text.
    text, char_count = await extract_text(file_bytes, content_type)
    logger.debug("Extracted %d chars from job %s", char_count, job_id)

    # 3. Call Claude.
    claude_response = await extract_resume(text, user_id, job_id)
    logger.debug("Claude returned %d work_history, %d education, %d skills for job %s",
                 len(claude_response.get("work_history", [])),
                 len(claude_response.get("education", [])),
                 len(claude_response.get("skills", [])),
                 job_id)

    # 3.5 Parse-time provenance guard: check every extracted bullet +
    # the summary against the SAME truncated text the model saw. The
    # rewrite path has had this guard since it shipped; the parse path
    # that seeds all profile data did not — which is how a fabricated
    # metric can land in work_history unnoticed. Verdicts are surfaced
    # (stored on the job row + shown in the UI), never enforced: a
    # bullet with one unsourced number still carries real content.
    provenance = build_parse_provenance(
        claude_response, source_text=text[:MAX_TEXT_CHARS],
    )
    if provenance["flagged"]:
        logger.warning(
            "Resume parse provenance flagged %d item(s) for job %s: %s",
            len(provenance["flagged"]),
            job_id,
            [entry["unsourced_terms"] for entry in provenance["flagged"]][:5],
        )

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
            return False

        # Merge work_history and education: a re-upload carries rows the
        # profile already holds, so match before inserting.
        merge_result = await merge_parsed_profile_rows(
            db, user_id, work_entries, edu_entries,
        )

        # Skills use ON CONFLICT DO NOTHING for UNIQUE(user_id, lower(name)).
        skills_added = 0
        for skill in skill_entries:
            if await _upsert_skill_ignore_conflict(db, skill):
                skills_added += 1

        await db.flush()

        # Mark the job complete.
        await resume_upload_job_repo.mark_complete(
            db,
            job,
            result_parsed_fields=_build_parsed_fields(claude_response, provenance=provenance),
            parser_version=PARSER_VERSION,
        )

    logger.info(
        "Job %s complete: work %d added / %d matched, edu %d added / %d matched, "
        "%d / %d skills added",
        job_id,
        merge_result.work_history_added,
        merge_result.work_history_matched,
        merge_result.education_added,
        merge_result.education_matched,
        skills_added,
        len(skill_entries),
    )
    return merge_result.work_history_changed or skills_added > 0


async def _upsert_skill_ignore_conflict(db: AsyncSession, skill: Skill) -> bool:
    """Add a skill row; silently ignore UNIQUE(user_id, lower(name)) violations.

    Returns True when a row was inserted, False when the skill already existed.
    """
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
    result = await db.execute(stmt)
    return result.rowcount == 1


def _build_parsed_fields(claude_response: dict, *, provenance: dict | None = None) -> dict:
    """Build the JSONB summary stored on the job row for quick UI display."""
    return {
        "provenance": provenance,
        "summary": claude_response.get("summary"),
        "headline": claude_response.get("headline"),
        "work_history_count": len(claude_response.get("work_history") or []),
        "education_count": len(claude_response.get("education") or []),
        "skills_count": len(claude_response.get("skills") or []),
        "raw": claude_response,
    }


async def main() -> None:
    # Parses refresh the profile embedding, so load the model at boot: a
    # missing or corrupt model crashes the worker here (same as the
    # discovery scheduler) instead of on the first resume upload.
    discovery_embedding_service.load_model_eager()

    logger.info(
        "Resume worker started (parse + refinement prepare) — polling every %ds",
        POLL_INTERVAL_SECONDS,
    )
    while True:
        try:
            found_parse = await process_one()
        except Exception:
            logger.exception("Unexpected error in resume-parse loop")
            found_parse = False

        try:
            found_prepare = await process_one_session()
        except Exception:
            logger.exception("Unexpected error in refinement-prepare loop")
            found_prepare = False

        if not (found_parse or found_prepare):
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())


if __name__ == "__main__":
    run()
