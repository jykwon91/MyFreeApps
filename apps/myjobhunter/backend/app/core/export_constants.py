"""Which tables the GET /users/me/export payload covers, and which it does not.

``EXPORTED_TABLE_SECTIONS`` maps each exported table to its top-level key in
the export JSON. ``EXPORT_EXCLUDED_TABLES`` lists every user-linked table that
is deliberately NOT exported, each with the reason. A conformance test
(``tests/test_export_completeness.py``) fails when a user-owned table is in
neither, so a new table cannot silently miss the export.
"""
from typing import Final

EXPORTED_TABLE_SECTIONS: Final[dict[str, str]] = {
    "users": "user",
    "profiles": "profiles",
    "work_history": "work_history",
    "education": "education",
    "skills": "skills",
    "screening_answers": "screening_answers",
    "companies": "companies",
    "company_research": "company_research",
    "research_sources": "research_sources",
    "applications": "applications",
    "application_events": "application_events",
    "application_contacts": "application_contacts",
    "documents": "documents",
    "job_board_credentials": "job_board_credentials",
    "resume_upload_jobs": "resume_upload_jobs",
    "extraction_logs": "extraction_logs",
    "job_analyses": "job_analyses",
    "discovery_sources": "discovery_sources",
    "discovery_fetches": "discovery_fetches",
    "discovered_jobs": "discovered_jobs",
    "resume_refinement_sessions": "resume_refinement_sessions",
    "resume_refinement_turns": "resume_refinement_turns",
}

EXPORT_EXCLUDED_TABLES: Final[dict[str, str]] = {
    "refresh_sessions": "Login-session credentials (token hashes); a secret with no value to the user.",
    "platform_invites": "Admin-issued invitation records keyed by recipient email and token hash, not user-owned data.",
    "auth_events": "Security audit trail written by the platform; not user content (no FK to users by design).",
    "audit_logs": "Security audit trail written by the platform; not user content.",
}
