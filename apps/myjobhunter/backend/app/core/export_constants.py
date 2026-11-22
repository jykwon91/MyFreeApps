"""Which tables the GET /users/me/export payload covers, and which it does not.

``EXPORTED_TABLE_SECTIONS`` maps each exported table to its top-level key in
the export JSON. ``EXPORT_EXCLUDED_TABLES`` lists every user-linked table that
is deliberately NOT exported, each with the reason. A conformance test
(``tests/test_export_completeness.py``) fails when a user-owned table is in
neither, so a new table cannot silently miss the export.

``EXPORT_EXCLUDED_COLUMNS`` is the single place that records, per exported
table, every column the export leaves out and why. The same test fails when a
model column is neither exported by its mapper nor listed here.
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

_OWNER_FK = "Owner foreign key; the export is already scoped to this one user."
_EMBEDDING = "Derived vector embedding (or its bookkeeping); regenerable, not user-authored."

EXPORT_EXCLUDED_COLUMNS: Final[dict[str, dict[str, str]]] = {
    "users": {
        "hashed_password": "Credential hash; a secret.",
        "totp_secret": "Encrypted 2FA secret; a credential.",
        "totp_recovery_codes": "Encrypted 2FA recovery codes; credentials.",
        "totp_algorithm": "2FA verification internals.",
        "totp_last_used_step": "2FA replay-protection internals.",
        "auth_valid_after": "Session-invalidation watermark; security internals.",
        "failed_login_count": "Login lockout counter; security internals.",
        "last_failed_login_at": "Login lockout state; security internals.",
        "locked_until": "Login lockout state; security internals.",
    },
    "profiles": {
        "user_id": _OWNER_FK,
        "embedding": _EMBEDDING,
        "embedding_model": _EMBEDDING,
        "embedded_at": _EMBEDDING,
    },
    "work_history": {"user_id": _OWNER_FK},
    "education": {"user_id": _OWNER_FK},
    "skills": {"user_id": _OWNER_FK},
    "screening_answers": {"user_id": _OWNER_FK},
    "companies": {"user_id": _OWNER_FK},
    "company_research": {"user_id": _OWNER_FK},
    "research_sources": {"user_id": _OWNER_FK},
    "applications": {"user_id": _OWNER_FK},
    "application_events": {"user_id": _OWNER_FK},
    "application_contacts": {"user_id": _OWNER_FK},
    "documents": {"user_id": _OWNER_FK},
    "job_board_credentials": {
        "user_id": _OWNER_FK,
        "encrypted_credentials": "Ciphertext of the board credentials; a secret.",
        "key_version": "Encryption key bookkeeping for the ciphertext.",
    },
    "resume_upload_jobs": {"user_id": _OWNER_FK},
    "extraction_logs": {"user_id": _OWNER_FK},
    "job_analyses": {
        "user_id": _OWNER_FK,
        "fingerprint": "Internal de-duplication hash derived from the job description.",
    },
    "discovery_sources": {"user_id": _OWNER_FK},
    "discovery_fetches": {"user_id": _OWNER_FK},
    "discovered_jobs": {
        "user_id": _OWNER_FK,
        "embedding": _EMBEDDING,
        "embedding_model": _EMBEDDING,
        "embedded_at": _EMBEDDING,
        "raw_payload": "The job board's raw API response; third-party data, not the user's.",
        "content_hash": "Internal de-duplication hash.",
        "description_normalized": "Derived normalization of description, used for hashing.",
    },
    "resume_refinement_sessions": {
        "user_id": _OWNER_FK,
        "proposal_cache": "Internal AI proposal cache; regenerable.",
    },
    "resume_refinement_turns": {},
}
