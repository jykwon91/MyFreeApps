"""MJH-specific account-management services.

This module owns:

  * :func:`build_export` — assembles a full per-user data export across
    every MJH-owned domain table (15 tables — see ``apps/myjobhunter/CLAUDE.md``).
    MJH-specific because the domain rows differ across apps. Excludes
    every secret / encrypted column so an exported JSON dump never
    leaks credentials.
  * :func:`delete_account` — hard-delete the user row; the FK ON DELETE
    CASCADE wipes every related domain row in a single statement.
    The ``ACCOUNT_DELETED`` auth event is emitted BEFORE the cascade so
    the row is written in the same transaction (and survives because
    ``auth_events.user_id`` has no FK to ``users.id`` — see
    ``platform_shared.db.models.auth_event`` for the rationale).

Lockout-policy helpers (``record_failed_login``, ``record_successful_login``,
``is_locked``) are NOT mirrored here — MJH does not yet wire login lockout
(C5 will). When that lands, follow MBK's M7 pattern and re-export shims
from ``platform_shared.services.account_lockout``.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.auth_event_service import log_auth_event

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
from app.models.system.extraction_log import ExtractionLog
from app.models.user.user import User

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Per-row mappers — pure functions, no DB
#
# Each mapper enumerates the exact set of fields exported for that row.
# Sensitive / encrypted columns are intentionally absent so adding a new
# field never auto-leaks secrets — every new field has to be opted in here.
# ---------------------------------------------------------------------------


def _user_to_export_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "totp_enabled": user.totp_enabled,
        # Excluded: hashed_password, totp_secret_encrypted, totp_recovery_codes
    }


def _profile_to_export_dict(profile: Profile) -> dict:
    return {
        "id": str(profile.id),
        "resume_file_path": profile.resume_file_path,
        "parser_version": profile.parser_version,
        "parsed_at": profile.parsed_at.isoformat() if profile.parsed_at else None,
        "work_auth_status": profile.work_auth_status,
        "desired_salary_min": str(profile.desired_salary_min) if profile.desired_salary_min is not None else None,
        "desired_salary_max": str(profile.desired_salary_max) if profile.desired_salary_max is not None else None,
        "salary_currency": profile.salary_currency,
        "salary_period": profile.salary_period,
        "locations": list(profile.locations or []),
        "remote_preference": profile.remote_preference,
        "seniority": profile.seniority,
        "summary": profile.summary,
        "timezone": profile.timezone,
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


def _work_history_to_export_dict(item: WorkHistory) -> dict:
    return {
        "id": str(item.id),
        "company_name": item.company_name,
        "title": item.title,
        "start_date": item.start_date.isoformat() if item.start_date else None,
        "end_date": item.end_date.isoformat() if item.end_date else None,
        "bullets": list(item.bullets or []),
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _education_to_export_dict(item: Education) -> dict:
    return {
        "id": str(item.id),
        "school": item.school,
        "degree": item.degree,
        "field": item.field,
        "start_year": item.start_year,
        "end_year": item.end_year,
        "gpa": str(item.gpa) if item.gpa is not None else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _skill_to_export_dict(item: Skill) -> dict:
    return {
        "id": str(item.id),
        "name": item.name,
        "years_experience": item.years_experience,
        "category": item.category,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _screening_answer_to_export_dict(item: ScreeningAnswer) -> dict:
    return {
        "id": str(item.id),
        "question_key": item.question_key,
        "answer": item.answer,
        "is_eeoc": item.is_eeoc,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _company_to_export_dict(item: Company) -> dict:
    return {
        "id": str(item.id),
        "name": item.name,
        "primary_domain": item.primary_domain,
        "industry": item.industry,
        "size_range": item.size_range,
        "hq_location": item.hq_location,
        "description": item.description,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _company_research_to_export_dict(item: CompanyResearch) -> dict:
    return {
        "id": str(item.id),
        "company_id": str(item.company_id),
        "overall_sentiment": item.overall_sentiment,
        "senior_engineer_sentiment": item.senior_engineer_sentiment,
        "interview_process": item.interview_process,
        "red_flags": list(item.red_flags or []),
        "green_flags": list(item.green_flags or []),
        "reported_comp_range_min": str(item.reported_comp_range_min) if item.reported_comp_range_min is not None else None,
        "reported_comp_range_max": str(item.reported_comp_range_max) if item.reported_comp_range_max is not None else None,
        "comp_currency": item.comp_currency,
        "comp_confidence": item.comp_confidence,
        "last_researched_at": item.last_researched_at.isoformat() if item.last_researched_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _research_source_to_export_dict(item: ResearchSource) -> dict:
    return {
        "id": str(item.id),
        "company_research_id": str(item.company_research_id),
        "url": item.url,
        "title": item.title,
        "snippet": item.snippet,
        "source_type": item.source_type,
        "fetched_at": item.fetched_at.isoformat() if item.fetched_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _application_to_export_dict(item: Application) -> dict:
    return {
        "id": str(item.id),
        "company_id": str(item.company_id),
        "role_title": item.role_title,
        "url": item.url,
        "source": item.source,
        "applied_at": item.applied_at.isoformat() if item.applied_at else None,
        "posted_salary_min": str(item.posted_salary_min) if item.posted_salary_min is not None else None,
        "posted_salary_max": str(item.posted_salary_max) if item.posted_salary_max is not None else None,
        "posted_salary_currency": item.posted_salary_currency,
        "posted_salary_period": item.posted_salary_period,
        "location": item.location,
        "remote_type": item.remote_type,
        "fit_score": str(item.fit_score) if item.fit_score is not None else None,
        "notes": item.notes,
        "archived": item.archived,
        "deleted_at": item.deleted_at.isoformat() if item.deleted_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _application_event_to_export_dict(item: ApplicationEvent) -> dict:
    return {
        "id": str(item.id),
        "application_id": str(item.application_id),
        "event_type": item.event_type,
        "occurred_at": item.occurred_at.isoformat() if item.occurred_at else None,
        "source": item.source,
        "note": item.note,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _application_contact_to_export_dict(item: ApplicationContact) -> dict:
    return {
        "id": str(item.id),
        "application_id": str(item.application_id),
        "name": item.name,
        "email": item.email,
        "linkedin_url": item.linkedin_url,
        "role": item.role,
        "notes": item.notes,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _document_to_export_dict(item: Document) -> dict:
    return {
        "id": str(item.id),
        "application_id": str(item.application_id) if item.application_id else None,
        "title": item.title,
        "kind": item.kind,
        "body": item.body,
        "file_path": item.file_path,
        "filename": item.filename,
        "content_type": item.content_type,
        "size_bytes": item.size_bytes,
        "deleted_at": item.deleted_at.isoformat() if item.deleted_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _job_board_credential_to_export_dict(item: JobBoardCredential) -> dict:
    # SECURITY: encrypted_credentials and key_version are intentionally excluded.
    # Returning ciphertext provides no value to the user and risks downstream
    # mishandling. Only the connection metadata is exported.
    return {
        "id": str(item.id),
        "board": item.board,
        "last_used_at": item.last_used_at.isoformat() if item.last_used_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _resume_upload_job_to_export_dict(item: ResumeUploadJob) -> dict:
    return {
        "id": str(item.id),
        "file_path": item.file_path,
        "status": item.status,
        "retry_count": item.retry_count,
        "error_message": item.error_message,
        "parser_version": item.parser_version,
        "started_at": item.started_at.isoformat() if item.started_at else None,
        "completed_at": item.completed_at.isoformat() if item.completed_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _extraction_log_to_export_dict(item: ExtractionLog) -> dict:
    return {
        "id": str(item.id),
        "context_type": item.context_type,
        "context_id": str(item.context_id) if item.context_id else None,
        "model": item.model,
        "input_tokens": item.input_tokens,
        "output_tokens": item.output_tokens,
        "cache_read_tokens": item.cache_read_tokens,
        "cache_write_tokens": item.cache_write_tokens,
        "cost_usd": str(item.cost_usd) if item.cost_usd is not None else None,
        "duration_ms": item.duration_ms,
        "status": item.status,
        "error_message": item.error_message,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


async def _list_for_user(db: AsyncSession, model, user_id: uuid.UUID) -> list:
    """Generic ``SELECT * FROM model WHERE user_id = :user_id`` helper."""
    result = await db.execute(select(model).where(model.user_id == user_id))
    return list(result.scalars().all())


async def build_export(db: AsyncSession, user: User) -> dict:
    """Assemble the full data export for ``user``.

    Pulls one query per domain table (15 total), applies a per-row mapper
    that explicitly enumerates the exported fields (so secrets / encrypted
    columns can never leak by default), and emits a ``DATA_EXPORTED``
    auth event before returning.
    """
    profiles = await _list_for_user(db, Profile, user.id)
    work_history = await _list_for_user(db, WorkHistory, user.id)
    education = await _list_for_user(db, Education, user.id)
    skills = await _list_for_user(db, Skill, user.id)
    screening_answers = await _list_for_user(db, ScreeningAnswer, user.id)

    companies = await _list_for_user(db, Company, user.id)
    company_research = await _list_for_user(db, CompanyResearch, user.id)
    research_sources = await _list_for_user(db, ResearchSource, user.id)

    applications = await _list_for_user(db, Application, user.id)
    application_events = await _list_for_user(db, ApplicationEvent, user.id)
    application_contacts = await _list_for_user(db, ApplicationContact, user.id)
    documents = await _list_for_user(db, Document, user.id)

    job_board_credentials = await _list_for_user(db, JobBoardCredential, user.id)
    resume_upload_jobs = await _list_for_user(db, ResumeUploadJob, user.id)
    extraction_logs = await _list_for_user(db, ExtractionLog, user.id)

    await log_auth_event(
        db,
        event_type=AuthEventType.DATA_EXPORTED,
        user_id=user.id,
        succeeded=True,
    )

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": _user_to_export_dict(user),
        "profiles": [_profile_to_export_dict(p) for p in profiles],
        "work_history": [_work_history_to_export_dict(w) for w in work_history],
        "education": [_education_to_export_dict(e) for e in education],
        "skills": [_skill_to_export_dict(s) for s in skills],
        "screening_answers": [_screening_answer_to_export_dict(a) for a in screening_answers],
        "companies": [_company_to_export_dict(c) for c in companies],
        "company_research": [_company_research_to_export_dict(r) for r in company_research],
        "research_sources": [_research_source_to_export_dict(r) for r in research_sources],
        "applications": [_application_to_export_dict(a) for a in applications],
        "application_events": [_application_event_to_export_dict(e) for e in application_events],
        "application_contacts": [_application_contact_to_export_dict(c) for c in application_contacts],
        "documents": [_document_to_export_dict(d) for d in documents],
        "job_board_credentials": [_job_board_credential_to_export_dict(j) for j in job_board_credentials],
        "resume_upload_jobs": [_resume_upload_job_to_export_dict(j) for j in resume_upload_jobs],
        "extraction_logs": [_extraction_log_to_export_dict(l) for l in extraction_logs],
    }


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def delete_account(db: AsyncSession, user: User) -> None:
    """Hard-delete ``user``; all related rows cascade-delete via FK.

    Order matters:
      1. ``log_auth_event(ACCOUNT_DELETED)`` writes the audit row in the
         same transaction. The ``auth_events.user_id`` column has NO
         foreign key to ``users.id`` (intentional — see
         ``platform_shared.db.models.auth_event``) so the row survives
         the cascade and remains queryable for the admin audit log.
      2. ``db.delete(user)`` issues ``DELETE FROM users WHERE id=...``.
         Every MJH-owned table has ``ON DELETE CASCADE`` on its
         ``user_id`` FK, so the single statement wipes all 15 domain
         tables for this user atomically.

    The caller is responsible for committing the surrounding transaction
    (this function does not flush or commit).
    """
    logger.warning(
        "Account deletion: user_id=%s email=%s",
        user.id,
        user.email,
    )
    # Re-fetch via the session so SQLAlchemy emits a real DELETE statement
    # (rather than a no-op when the caller passed a detached instance).
    loaded_user = await db.get(User, user.id)
    if loaded_user is None:
        return
    # Log BEFORE delete — the auth_events table has no FK to users, so the
    # event row is safe even after the user cascade completes.
    await log_auth_event(
        db,
        event_type=AuthEventType.ACCOUNT_DELETED,
        user_id=user.id,
        succeeded=True,
    )
    await db.delete(loaded_user)
