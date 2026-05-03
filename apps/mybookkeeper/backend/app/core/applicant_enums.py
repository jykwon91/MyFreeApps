"""Canonical string values for the Applicants domain (rentals Phase 3).

Per RENTALS_PLAN.md §4.1: status / category columns use ``String(N)`` plus a
``CheckConstraint``, never ``SQLAlchemy Enum``. These tuples are the single
source of truth — referenced from both the SQLAlchemy model
``CheckConstraint``s and the Alembic migration DDL.

Mirrors ``app/core/inquiry_enums.py`` (Phase 2) for consistency.
"""

# Applicant pipeline stages. ``lead`` is the entry point (set when an
# Inquiry is promoted to an Applicant via the PR 3.2 promotion service).
APPLICANT_STAGES: tuple[str, ...] = (
    "lead",
    "screening_pending",
    "screening_passed",
    "screening_failed",
    "video_call_done",
    "approved",
    "lease_sent",
    "lease_signed",
    "declined",
)

# Applicant timeline event types — superset of ``APPLICANT_STAGES`` plus
# non-stage events that the host or system can record on the timeline.
APPLICANT_EVENT_TYPES: tuple[str, ...] = APPLICANT_STAGES + (
    "note_added",
    "screening_initiated",
    "screening_completed",
    "reference_contacted",
    "stage_changed",
    "contract_dates_changed",
)

APPLICANT_EVENT_ACTORS: tuple[str, ...] = ("host", "system", "applicant")

# Screening provider identifiers. Keep this list minimal — every value here
# corresponds to a code path in the (future) PR 3.3 screening integration.
SCREENING_PROVIDERS: tuple[str, ...] = ("keycheck", "rentspree", "other")

# Screening report status. ``inconclusive`` is a real provider response
# (e.g. KeyCheck returns it when the applicant didn't complete consent).
SCREENING_STATUSES: tuple[str, ...] = ("pending", "pass", "fail", "inconclusive")

# Reference relationship to the applicant.
REFERENCE_RELATIONSHIPS: tuple[str, ...] = (
    "landlord",
    "employer",
    "personal",
    "professional",
    "family",
    "other",
)


def _sql_in_list(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


APPLICANT_STAGES_SQL = _sql_in_list(APPLICANT_STAGES)
APPLICANT_EVENT_TYPES_SQL = _sql_in_list(APPLICANT_EVENT_TYPES)
APPLICANT_EVENT_ACTORS_SQL = _sql_in_list(APPLICANT_EVENT_ACTORS)
SCREENING_PROVIDERS_SQL = _sql_in_list(SCREENING_PROVIDERS)
SCREENING_STATUSES_SQL = _sql_in_list(SCREENING_STATUSES)
REFERENCE_RELATIONSHIPS_SQL = _sql_in_list(REFERENCE_RELATIONSHIPS)
