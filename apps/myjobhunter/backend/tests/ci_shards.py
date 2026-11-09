"""Which CI shard runs each backend test file.

``.github/workflows/ci-myjobhunter.yml`` runs ``pytest tests`` once per shard
with ``MJH_TEST_SHARD`` set to the shard's name, and ``tests/conftest.py``
skips every file that belongs to a different shard.

The lists below only move files OUT of the catch-all shard to balance run
time. Every file that is not listed runs in ``CATCH_ALL_SHARD``, so a new
test file is picked up by CI with no list to edit. Shard names are required
status checks on main: renaming or adding one needs the branch-protection
rule updated in the same change. ``tests/test_ci_shards.py`` checks this
module against the workflow.
"""
from __future__ import annotations

SHARD_ENV_VAR = "MJH_TEST_SHARD"

CATCH_ALL_SHARD = "fast"

LISTED_SHARDS: dict[str, tuple[str, ...]] = {
    # Application / company / profile CRUD through the API.
    "crud": (
        "test_application_get_by_id.py",
        "test_application_status_column.py",
        "test_application_events.py",
        "test_application_contacts.py",
        "test_application_list_filters.py",
        "test_application_company_filter.py",
        "test_application_writes.py",
        "test_company_writes.py",
        "test_company_name_search.py",
        "test_profile_writes.py",
    ),
    # Suites that log in many times (lockout, per-IP limits, re-auth).
    "login-heavy": (
        "test_account_lockout.py",
        "test_login_ip_rate_limit.py",
        "test_account_deletion.py",
        "test_data_export.py",
    ),
    "totp": (
        "test_totp_login.py",
        "test_totp_setup.py",
        "test_mobile_auth.py",
    ),
    # Resume refinement + parse: pure-function and mocked tests.
    "refinement": (
        "test_resume_refinement_hallucination_guard.py",
        "test_resume_refinement_rewrite_service.py",
        "test_resume_refinement_critique_service.py",
        "test_resume_refinement_export_service.py",
        "test_resume_refinement_markdown_renderer.py",
        "test_resume_refinement_renderer.py",
        "test_resume_refinement_proposal_cache.py",
        "test_resume_refinement_session_helpers.py",
        "test_resume_refinement_guard_confirmation.py",
        "test_resume_refinement_preparing_flow.py",
        "test_resume_parse_provenance.py",
        "test_resume_mapper.py",
        "test_resume_refinement_user_targets.py",
    ),
}

ALL_SHARDS: frozenset[str] = frozenset({CATCH_ALL_SHARD, *LISTED_SHARDS})


def shard_for(test_file: str) -> str:
    """Return the shard that runs ``test_file`` (a path relative to ``tests/``)."""
    for shard, files in LISTED_SHARDS.items():
        if test_file in files:
            return shard
    return CATCH_ALL_SHARD
