"""Per-row export mappers for every table in the account data export.

Each mapper lists exactly the fields exported, so a new column is never
exported (or leaked) without being opted in. The columns deliberately left
out, and why, live in ONE place: ``app.core.export_constants.EXPORT_EXCLUDED_COLUMNS``.
``tests/test_export_completeness.py`` fails when a model column is neither
exported by its mapper nor listed there.

Decrypted PII needs no special handling: ``EncryptedString`` columns decrypt
transparently on attribute access, and the only such columns (the user's TOTP
secret and recovery codes) are excluded as credentials.
"""
from collections.abc import Callable
from datetime import date, datetime

from app.models.application.application import Application
from app.models.application.application_contact import ApplicationContact
from app.models.application.application_event import ApplicationEvent
from app.models.application.document import Document
from app.models.company.company import Company
from app.models.company.company_research import CompanyResearch
from app.models.company.research_source import ResearchSource
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource
from app.models.integration.job_board_credential import JobBoardCredential
from app.models.job_analysis.job_analysis import JobAnalysis
from app.models.jobs.resume_upload_job import ResumeUploadJob
from app.models.profile.education import Education
from app.models.profile.profile import Profile
from app.models.profile.screening_answer import ScreeningAnswer
from app.models.profile.skill import Skill
from app.models.profile.work_history import WorkHistory
from app.models.resume_refinement.session import ResumeRefinementSession
from app.models.resume_refinement.turn import ResumeRefinementTurn
from app.models.system.extraction_log import ExtractionLog
from app.models.user.user import User


def _iso(value: datetime | date | None) -> str | None:
    return value.isoformat() if value else None


def _opt_str(value: object | None) -> str | None:
    return str(value) if value is not None else None


def user_to_export_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "is_superuser": user.is_superuser,
        "is_demo": user.is_demo,
        "role": user.role,
        "totp_enabled": user.totp_enabled,
    }


def profile_to_export_dict(profile: Profile) -> dict:
    return {
        "id": str(profile.id),
        "resume_file_path": profile.resume_file_path,
        "parser_version": profile.parser_version,
        "parsed_at": _iso(profile.parsed_at),
        "parsed_fields": profile.parsed_fields,
        "work_auth_status": profile.work_auth_status,
        "desired_salary_min": _opt_str(profile.desired_salary_min),
        "desired_salary_max": _opt_str(profile.desired_salary_max),
        "salary_currency": profile.salary_currency,
        "salary_period": profile.salary_period,
        "locations": list(profile.locations or []),
        "remote_preference": profile.remote_preference,
        "seniority": profile.seniority,
        "summary": profile.summary,
        "timezone": profile.timezone,
        "discovery_defaults": profile.discovery_defaults,
        "created_at": _iso(profile.created_at),
        "updated_at": _iso(profile.updated_at),
    }


def work_history_to_export_dict(item: WorkHistory) -> dict:
    return {
        "id": str(item.id),
        "profile_id": _opt_str(item.profile_id),
        "company_name": item.company_name,
        "title": item.title,
        "start_date": _iso(item.start_date),
        "end_date": _iso(item.end_date),
        "is_current": bool(item.is_current),
        "bullets": list(item.bullets or []),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def education_to_export_dict(item: Education) -> dict:
    return {
        "id": str(item.id),
        "profile_id": _opt_str(item.profile_id),
        "school": item.school,
        "degree": item.degree,
        "field": item.field,
        "start_year": item.start_year,
        "end_year": item.end_year,
        "gpa": _opt_str(item.gpa),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def skill_to_export_dict(item: Skill) -> dict:
    return {
        "id": str(item.id),
        "profile_id": _opt_str(item.profile_id),
        "name": item.name,
        "years_experience": item.years_experience,
        "category": item.category,
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def screening_answer_to_export_dict(item: ScreeningAnswer) -> dict:
    return {
        "id": str(item.id),
        "profile_id": _opt_str(item.profile_id),
        "question_key": item.question_key,
        "answer": item.answer,
        "is_eeoc": item.is_eeoc,
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def company_to_export_dict(item: Company) -> dict:
    return {
        "id": str(item.id),
        "name": item.name,
        "primary_domain": item.primary_domain,
        "logo_url": item.logo_url,
        "industry": item.industry,
        "size_range": item.size_range,
        "hq_location": item.hq_location,
        "description": item.description,
        "crunchbase_id": item.crunchbase_id,
        "external_ref": item.external_ref,
        "external_source": item.external_source,
        "research_started_at": _iso(item.research_started_at),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def company_research_to_export_dict(item: CompanyResearch) -> dict:
    return {
        "id": str(item.id),
        "company_id": _opt_str(item.company_id),
        "overall_sentiment": item.overall_sentiment,
        "senior_engineer_sentiment": item.senior_engineer_sentiment,
        "interview_process": item.interview_process,
        "red_flags": list(item.red_flags or []),
        "green_flags": list(item.green_flags or []),
        "reported_comp_range_min": _opt_str(item.reported_comp_range_min),
        "reported_comp_range_max": _opt_str(item.reported_comp_range_max),
        "comp_currency": item.comp_currency,
        "comp_confidence": item.comp_confidence,
        "description": item.description,
        "products_for_you": item.products_for_you,
        "raw_synthesis": item.raw_synthesis,
        "last_researched_at": _iso(item.last_researched_at),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def research_source_to_export_dict(item: ResearchSource) -> dict:
    return {
        "id": str(item.id),
        "company_research_id": _opt_str(item.company_research_id),
        "url": item.url,
        "title": item.title,
        "snippet": item.snippet,
        "source_type": item.source_type,
        "fetched_at": _iso(item.fetched_at),
        "created_at": _iso(item.created_at),
    }


def application_to_export_dict(item: Application) -> dict:
    return {
        "id": str(item.id),
        "company_id": _opt_str(item.company_id),
        "role_title": item.role_title,
        "url": item.url,
        "jd_text": item.jd_text,
        "jd_parsed": item.jd_parsed,
        "source": item.source,
        "applied_at": _iso(item.applied_at),
        "posted_salary_min": _opt_str(item.posted_salary_min),
        "posted_salary_max": _opt_str(item.posted_salary_max),
        "posted_salary_currency": item.posted_salary_currency,
        "posted_salary_period": item.posted_salary_period,
        "location": item.location,
        "remote_type": item.remote_type,
        "fit_score": _opt_str(item.fit_score),
        "external_ref": item.external_ref,
        "external_source": item.external_source,
        "notes": item.notes,
        "archived": item.archived,
        "deleted_at": _iso(item.deleted_at),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def application_event_to_export_dict(item: ApplicationEvent) -> dict:
    return {
        "id": str(item.id),
        "application_id": _opt_str(item.application_id),
        "event_type": item.event_type,
        "occurred_at": _iso(item.occurred_at),
        "source": item.source,
        "email_message_id": item.email_message_id,
        "raw_payload": item.raw_payload,
        "interview_details": item.interview_details,
        "note": item.note,
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def application_contact_to_export_dict(item: ApplicationContact) -> dict:
    return {
        "id": str(item.id),
        "application_id": _opt_str(item.application_id),
        "name": item.name,
        "email": item.email,
        "linkedin_url": item.linkedin_url,
        "role": item.role,
        "notes": item.notes,
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def document_to_export_dict(item: Document) -> dict:
    return {
        "id": str(item.id),
        "application_id": _opt_str(item.application_id),
        "title": item.title,
        "kind": item.kind,
        "body": item.body,
        "file_path": item.file_path,
        "filename": item.filename,
        "content_type": item.content_type,
        "size_bytes": item.size_bytes,
        "deleted_at": _iso(item.deleted_at),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def job_board_credential_to_export_dict(item: JobBoardCredential) -> dict:
    return {
        "id": str(item.id),
        "board": item.board,
        "last_used_at": _iso(item.last_used_at),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def resume_upload_job_to_export_dict(item: ResumeUploadJob) -> dict:
    return {
        "id": str(item.id),
        "profile_id": _opt_str(item.profile_id),
        "file_path": item.file_path,
        "file_filename": item.file_filename,
        "file_content_type": item.file_content_type,
        "file_size_bytes": item.file_size_bytes,
        "status": item.status,
        "retry_count": item.retry_count,
        "next_retry_at": _iso(item.next_retry_at),
        "error_message": item.error_message,
        "parser_version": item.parser_version,
        "result_parsed_fields": item.result_parsed_fields,
        "started_at": _iso(item.started_at),
        "completed_at": _iso(item.completed_at),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def extraction_log_to_export_dict(item: ExtractionLog) -> dict:
    return {
        "id": str(item.id),
        "context_type": item.context_type,
        "context_id": _opt_str(item.context_id),
        "model": item.model,
        "input_tokens": item.input_tokens,
        "output_tokens": item.output_tokens,
        "cache_read_tokens": item.cache_read_tokens,
        "cache_write_tokens": item.cache_write_tokens,
        "cost_usd": _opt_str(item.cost_usd),
        "duration_ms": item.duration_ms,
        "status": item.status,
        "error_message": item.error_message,
        "created_at": _iso(item.created_at),
    }


def job_analysis_to_export_dict(item: JobAnalysis) -> dict:
    return {
        "id": str(item.id),
        "source_url": item.source_url,
        "jd_text": item.jd_text,
        "extracted": item.extracted,
        "verdict": item.verdict,
        "verdict_summary": item.verdict_summary,
        "dimensions": item.dimensions,
        "red_flags": list(item.red_flags or []),
        "green_flags": list(item.green_flags or []),
        "applied_application_id": _opt_str(item.applied_application_id),
        "total_tokens_in": item.total_tokens_in,
        "total_tokens_out": item.total_tokens_out,
        "total_cost_usd": _opt_str(item.total_cost_usd),
        "deleted_at": _iso(item.deleted_at),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def discovery_source_to_export_dict(item: DiscoverySource) -> dict:
    return {
        "id": str(item.id),
        "source": item.source,
        "name": item.name,
        "config": item.config,
        "is_active": item.is_active,
        "fetch_interval_minutes": item.fetch_interval_minutes,
        "last_fetched_at": _iso(item.last_fetched_at),
        "last_success_at": _iso(item.last_success_at),
        "last_seen_posted_at": _iso(item.last_seen_posted_at),
        "consecutive_failures": item.consecutive_failures,
        "last_error_at": _iso(item.last_error_at),
        "last_error_message": item.last_error_message,
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def discovery_fetch_to_export_dict(item: DiscoveryFetch) -> dict:
    return {
        "id": str(item.id),
        "discovery_source_id": str(item.discovery_source_id),
        "source": item.source,
        "started_at": _iso(item.started_at),
        "completed_at": _iso(item.completed_at),
        "status": item.status,
        "http_status": item.http_status,
        "fetched_count": item.fetched_count,
        "new_count": item.new_count,
        "updated_count": item.updated_count,
        "duration_ms": item.duration_ms,
        "error_message": item.error_message,
        "created_at": _iso(item.created_at),
    }


def discovered_job_to_export_dict(item: DiscoveredJob) -> dict:
    return {
        "id": str(item.id),
        "source": item.source,
        "source_external_id": item.source_external_id,
        "source_publisher": item.source_publisher,
        "source_url": item.source_url,
        "title": item.title,
        "company_name": item.company_name,
        "company_id": _opt_str(item.company_id),
        "location": item.location,
        "remote_type": item.remote_type,
        "description": item.description,
        "posted_at": _iso(item.posted_at),
        "discovered_at": _iso(item.discovered_at),
        "expired_at": _iso(item.expired_at),
        "source_expires_at": _iso(item.source_expires_at),
        "salary_min": _opt_str(item.salary_min),
        "salary_max": _opt_str(item.salary_max),
        "salary_currency": item.salary_currency,
        "salary_period": item.salary_period,
        "score": item.score,
        "score_reason": item.score_reason,
        "scored_at": _iso(item.scored_at),
        "scoring_extraction_log_id": _opt_str(item.scoring_extraction_log_id),
        "dismissed_at": _iso(item.dismissed_at),
        "dismissed_reason": item.dismissed_reason,
        "saved_before_dismissed_at": _iso(item.saved_before_dismissed_at),
        "saved_at": _iso(item.saved_at),
        "promoted_application_id": _opt_str(item.promoted_application_id),
        "promoted_at": _iso(item.promoted_at),
        "fetch_id": _opt_str(item.fetch_id),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def refinement_session_to_export_dict(item: ResumeRefinementSession) -> dict:
    return {
        "id": str(item.id),
        "source_resume_job_id": _opt_str(item.source_resume_job_id),
        "status": item.status,
        "error_message": item.error_message,
        "current_draft": item.current_draft,
        "improvement_targets": item.improvement_targets,
        "target_index": item.target_index,
        "confirmed_facts": list(item.confirmed_facts or []),
        "turn_count": item.turn_count,
        "guard_flag_counts": item.guard_flag_counts,
        "pending_target_section": item.pending_target_section,
        "pending_proposal": item.pending_proposal,
        "pending_rationale": item.pending_rationale,
        "pending_clarifying_question": item.pending_clarifying_question,
        "pending_guard_flagged": item.pending_guard_flagged,
        "pending_flagged_proposal": item.pending_flagged_proposal,
        "preparation_started_at": _iso(item.preparation_started_at),
        "preparation_retry_count": item.preparation_retry_count,
        "preparation_next_retry_at": _iso(item.preparation_next_retry_at),
        "total_tokens_in": item.total_tokens_in,
        "total_tokens_out": item.total_tokens_out,
        "total_cost_usd": _opt_str(item.total_cost_usd),
        "completed_at": _iso(item.completed_at),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def refinement_turn_to_export_dict(item: ResumeRefinementTurn) -> dict:
    return {
        "id": str(item.id),
        "session_id": str(item.session_id),
        "turn_index": item.turn_index,
        "role": item.role,
        "target_section": item.target_section,
        "proposed_text": item.proposed_text,
        "user_text": item.user_text,
        "rationale": item.rationale,
        "clarifying_question": item.clarifying_question,
        "draft_after": item.draft_after,
        "tokens_in": item.tokens_in,
        "tokens_out": item.tokens_out,
        "created_at": _iso(item.created_at),
    }


EXPORT_MAPPERS: dict[str, Callable[..., dict]] = {
    "users": user_to_export_dict,
    "profiles": profile_to_export_dict,
    "work_history": work_history_to_export_dict,
    "education": education_to_export_dict,
    "skills": skill_to_export_dict,
    "screening_answers": screening_answer_to_export_dict,
    "companies": company_to_export_dict,
    "company_research": company_research_to_export_dict,
    "research_sources": research_source_to_export_dict,
    "applications": application_to_export_dict,
    "application_events": application_event_to_export_dict,
    "application_contacts": application_contact_to_export_dict,
    "documents": document_to_export_dict,
    "job_board_credentials": job_board_credential_to_export_dict,
    "resume_upload_jobs": resume_upload_job_to_export_dict,
    "extraction_logs": extraction_log_to_export_dict,
    "job_analyses": job_analysis_to_export_dict,
    "discovery_sources": discovery_source_to_export_dict,
    "discovery_fetches": discovery_fetch_to_export_dict,
    "discovered_jobs": discovered_job_to_export_dict,
    "resume_refinement_sessions": refinement_session_to_export_dict,
    "resume_refinement_turns": refinement_turn_to_export_dict,
}
