"""Export mappers for the analysis, discovery and resume-refinement domains.

Same convention as ``account_service``: each mapper lists exactly the fields
exported, so a new column is never exported (or leaked) without being opted in.
Left out on purpose: ``DiscoveredJob.embedding`` (a vector blob),
``DiscoveredJob.raw_payload`` (the job board's raw response), and
``ResumeRefinementSession.proposal_cache`` (an internal AI cache).
"""
from datetime import datetime

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource
from app.models.job_analysis.job_analysis import JobAnalysis
from app.models.resume_refinement.session import ResumeRefinementSession
from app.models.resume_refinement.turn import ResumeRefinementTurn


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _opt_str(value: object | None) -> str | None:
    return str(value) if value is not None else None


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
        "salary_min": _opt_str(item.salary_min),
        "salary_max": _opt_str(item.salary_max),
        "salary_currency": item.salary_currency,
        "salary_period": item.salary_period,
        "score": item.score,
        "score_reason": item.score_reason,
        "scored_at": _iso(item.scored_at),
        "dismissed_at": _iso(item.dismissed_at),
        "dismissed_reason": item.dismissed_reason,
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
        "created_at": _iso(item.created_at),
    }
