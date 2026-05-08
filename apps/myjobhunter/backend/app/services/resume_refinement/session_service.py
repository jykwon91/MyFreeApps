"""Thin re-export shim — preserves all existing import paths.

The real logic lives in the focused sub-modules:

- ``session_lifecycle_service`` — start_session, get_session_state, complete_session
- ``session_turn_service``      — accept_pending, accept_custom, request_alternative,
                                   skip_target, navigate
- ``session_helpers``           — private helpers (_with_turns, _load_active,
                                   _build_prior_context, _current_target,
                                   _apply_rewrite, _generate_next_proposal,
                                   _prefetch_all_proposals)

Callers that do ``from app.services.resume_refinement import session_service``
and then call ``session_service.start_session(...)`` continue to work without
any changes. The test suite patches ``session_service.<symbol>`` — those patches
resolve through this module's namespace, which re-exports the symbols from
whichever sub-module owns them. patch.object(session_service, "rewrite_service")
works because this module also re-exports the ``rewrite_service`` module
reference and ``session_repo`` / ``turn_repo`` repository references.
"""
from __future__ import annotations

# Public entry points — lifecycle
from app.services.resume_refinement.session_lifecycle_service import (
    complete_session,
    get_session_state,
    start_session,
)

# Public entry points — turn mutations
from app.services.resume_refinement.session_turn_service import (
    accept_custom,
    accept_pending,
    navigate,
    request_alternative,
    skip_target,
)

# Private helpers — re-exported so test patches against session_service.<name> work
from app.services.resume_refinement.session_helpers import (
    _PREFETCH_CONCURRENCY,
    _apply_rewrite,
    _build_prior_context,
    _current_target,
    _generate_next_proposal,
    _load_active,
    _prefetch_all_proposals,
    _with_turns,
)

# Lifecycle-only helper — re-exported for test patches in test_resume_refinement_renderer.py
from app.services.resume_refinement.session_lifecycle_service import (
    _build_renderer_input,
)

# Module-level references re-exported so patch.object(session_service, "rewrite_service")
# and patch.object(session_service, "session_repo") / "turn_repo" continue to work,
# and so string-based patch("app.services.resume_refinement.session_service.<name>.<method>")
# in tests resolves correctly.
from app.repositories.jobs import resume_upload_job_repo
from app.repositories.profile import (
    education_repository,
    profile_repository,
    skill_repository,
    work_history_repository,
)
from app.repositories.resume_refinement import session_repo, turn_repo
from app.services.resume_refinement import critique_service, rewrite_service

__all__ = [
    # Lifecycle
    "start_session",
    "get_session_state",
    "complete_session",
    # Turn mutations
    "accept_pending",
    "accept_custom",
    "request_alternative",
    "skip_target",
    "navigate",
    # Private helpers (tests import these directly)
    "_PREFETCH_CONCURRENCY",
    "_apply_rewrite",
    "_build_prior_context",
    "_build_renderer_input",
    "_current_target",
    "_generate_next_proposal",
    "_load_active",
    "_prefetch_all_proposals",
    "_with_turns",
    # Module refs (tests use patch / patch.object against these)
    "session_repo",
    "turn_repo",
    "rewrite_service",
    "critique_service",
    "resume_upload_job_repo",
    "profile_repository",
    "work_history_repository",
    "education_repository",
    "skill_repository",
]
