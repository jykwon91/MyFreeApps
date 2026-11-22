"""MJH-specific account-management services.

This module owns:

  * :func:`build_export` — assembles a full per-user data export across
    every MJH-owned domain table (see ``apps/myjobhunter/CLAUDE.md``).
    MJH-specific because the domain rows differ across apps. Includes
    every user data column; secrets and internals are the documented
    exclusions in ``app.core.export_constants.EXPORT_EXCLUDED_COLUMNS``.

Lockout-policy helpers (``record_failed_login``, ``record_successful_login``,
``is_locked``) are NOT mirrored here — MJH does not yet wire login lockout
(C5 will). When that lands, follow MBK's M7 pattern and re-export shims
from ``platform_shared.services.account_lockout``.
"""
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.db.session import unit_of_work_on_same_database
from platform_shared.services.auth_event_service import log_auth_event

from app.models.application.application import Application
from app.models.application.application_contact import ApplicationContact
from app.models.application.application_event import ApplicationEvent
from app.models.application.document import Document
from app.models.company.company import Company
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource
from app.models.job_analysis.job_analysis import JobAnalysis
from app.models.resume_refinement.session import ResumeRefinementSession
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
from app.repositories.user.export_repository import list_for_user, list_refinement_turns_for_user
from app.services.user import export_mappers


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


async def build_export(db: AsyncSession, user: User) -> dict:
    """Assemble the full data export for ``user``.

    Pulls one query per domain table, applies a per-row mapper
    that explicitly enumerates the exported fields (so secrets / encrypted
    columns can never leak by default; see ``export_mappers``), and emits a ``DATA_EXPORTED``
    auth event before returning. The audit event is written in its own
    transaction on the same database, because the request session never
    auto-commits and the event would otherwise be rolled back.
    """
    profiles = await list_for_user(db, Profile, user.id)
    work_history = await list_for_user(db, WorkHistory, user.id)
    education = await list_for_user(db, Education, user.id)
    skills = await list_for_user(db, Skill, user.id)
    screening_answers = await list_for_user(db, ScreeningAnswer, user.id)

    companies = await list_for_user(db, Company, user.id)
    company_research = await list_for_user(db, CompanyResearch, user.id)
    research_sources = await list_for_user(db, ResearchSource, user.id)

    applications = await list_for_user(db, Application, user.id)
    application_events = await list_for_user(db, ApplicationEvent, user.id)
    application_contacts = await list_for_user(db, ApplicationContact, user.id)
    documents = await list_for_user(db, Document, user.id)

    job_board_credentials = await list_for_user(db, JobBoardCredential, user.id)
    resume_upload_jobs = await list_for_user(db, ResumeUploadJob, user.id)
    extraction_logs = await list_for_user(db, ExtractionLog, user.id)

    job_analyses = await list_for_user(db, JobAnalysis, user.id)
    discovery_sources = await list_for_user(db, DiscoverySource, user.id)
    discovery_fetches = await list_for_user(db, DiscoveryFetch, user.id)
    discovered_jobs = await list_for_user(db, DiscoveredJob, user.id)
    refinement_sessions = await list_for_user(db, ResumeRefinementSession, user.id)
    refinement_turns = await list_refinement_turns_for_user(db, user.id)

    async with unit_of_work_on_same_database(db) as audit_db:
        await log_auth_event(
            audit_db,
            event_type=AuthEventType.DATA_EXPORTED,
            user_id=user.id,
            succeeded=True,
        )

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": export_mappers.user_to_export_dict(user),
        "profiles": [export_mappers.profile_to_export_dict(p) for p in profiles],
        "work_history": [export_mappers.work_history_to_export_dict(w) for w in work_history],
        "education": [export_mappers.education_to_export_dict(e) for e in education],
        "skills": [export_mappers.skill_to_export_dict(s) for s in skills],
        "screening_answers": [export_mappers.screening_answer_to_export_dict(a) for a in screening_answers],
        "companies": [export_mappers.company_to_export_dict(c) for c in companies],
        "company_research": [export_mappers.company_research_to_export_dict(r) for r in company_research],
        "research_sources": [export_mappers.research_source_to_export_dict(r) for r in research_sources],
        "applications": [export_mappers.application_to_export_dict(a) for a in applications],
        "application_events": [export_mappers.application_event_to_export_dict(e) for e in application_events],
        "application_contacts": [export_mappers.application_contact_to_export_dict(c) for c in application_contacts],
        "documents": [export_mappers.document_to_export_dict(d) for d in documents],
        "job_board_credentials": [export_mappers.job_board_credential_to_export_dict(j) for j in job_board_credentials],
        "resume_upload_jobs": [export_mappers.resume_upload_job_to_export_dict(j) for j in resume_upload_jobs],
        "extraction_logs": [export_mappers.extraction_log_to_export_dict(l) for l in extraction_logs],
        "job_analyses": [export_mappers.job_analysis_to_export_dict(a) for a in job_analyses],
        "discovery_sources": [export_mappers.discovery_source_to_export_dict(d) for d in discovery_sources],
        "discovery_fetches": [export_mappers.discovery_fetch_to_export_dict(d) for d in discovery_fetches],
        "discovered_jobs": [export_mappers.discovered_job_to_export_dict(d) for d in discovered_jobs],
        "resume_refinement_sessions": [
            export_mappers.refinement_session_to_export_dict(r) for r in refinement_sessions
        ],
        "resume_refinement_turns": [export_mappers.refinement_turn_to_export_dict(t) for t in refinement_turns],
    }
