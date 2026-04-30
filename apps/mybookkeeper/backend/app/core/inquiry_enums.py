"""Canonical string values for the Inquiries domain.

Per RENTALS_PLAN.md §4.1: status / category columns use ``String(N)`` plus a
``CheckConstraint``, never ``SQLAlchemy Enum``. These tuples are the single
source of truth — referenced from both the SQLAlchemy model
``CheckConstraint``s and the Alembic migration DDL.
"""

INQUIRY_SOURCES: tuple[str, ...] = ("FF", "TNH", "direct", "other", "public_form")

# Origin of the inquiry record — the channel that wrote it into MBK.
# Distinct from ``source`` which describes the listing channel; ``submitted_via``
# describes the back-end ingestion path.
INQUIRY_SUBMITTED_VIA: tuple[str, ...] = (
    "manual_entry",
    "gmail_oauth",
    "public_form",
)

# Spam triage states for the inquiry inbox tabs (T0).
# - ``unscored``: no spam assessments run yet (e.g. legacy Gmail-parsed rows
#   pre-T0, or rows where the Claude scoring step degraded).
# - ``clean``: passed the threshold + threshold+30 ceiling — operator sees normal
#   notification.
# - ``flagged``: passed but borderline — operator sees ``[FLAGGED]`` notification.
# - ``spam``: failed a hard gate (honeypot / disposable email) or scored below
#   threshold — no operator notification, hidden from default inbox view.
# - ``manually_cleared``: operator-overridden clean; survives re-scoring.
INQUIRY_SPAM_STATUSES: tuple[str, ...] = (
    "unscored",
    "clean",
    "flagged",
    "spam",
    "manually_cleared",
)

# Employment categories collected on the public inquiry form (T0).
INQUIRY_EMPLOYMENT_STATUSES: tuple[str, ...] = (
    "employed",
    "student",
    "self_employed",
    "between_jobs",
    "retired",
    "other",
)

# Spam-assessment check types — one row per check ever performed on an
# inquiry. ``manual_override`` is written when the operator clicks
# "Mark as not spam" / "Mark as spam" from the inbox.
INQUIRY_SPAM_ASSESSMENT_TYPES: tuple[str, ...] = (
    "turnstile",
    "honeypot",
    "submit_timing",
    "disposable_email",
    "rate_limit",
    "claude_score",
    "manual_override",
)

INQUIRY_STAGES: tuple[str, ...] = (
    "new",
    "triaged",
    "replied",
    "screening_requested",
    "video_call_scheduled",
    "approved",
    "declined",
    "converted",
    "archived",
)

# `received` is the seed event written when an Inquiry is created — it has no
# corresponding stage value because new inquiries start in stage `new`.
INQUIRY_EVENT_TYPES: tuple[str, ...] = ("received",) + INQUIRY_STAGES

INQUIRY_MESSAGE_DIRECTIONS: tuple[str, ...] = ("inbound", "outbound")
INQUIRY_MESSAGE_CHANNELS: tuple[str, ...] = ("email", "sms", "in_app")
INQUIRY_EVENT_ACTORS: tuple[str, ...] = ("host", "system", "applicant")

# Templated-reply variable allowlist (PR 2.3). Order matches longest-match-first
# substitution: ``$start_date`` and ``$end_date`` MUST be substituted before
# the shorter ``$start`` / ``$end`` variants would match — but since neither
# of those exists in the allowlist, ordering is purely documentational.
# ``$host_name`` MUST be substituted before ``$name`` to prevent the shorter
# variable from matching the longer placeholder. The renderer enforces this
# by sorting keys longest-first.
REPLY_TEMPLATE_VARIABLES: tuple[str, ...] = (
    "$start_date",
    "$end_date",
    "$host_name",
    "$host_phone",
    "$employer",
    "$listing",
    "$dates",
    "$name",
)


def _sql_in_list(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


INQUIRY_SOURCES_SQL = _sql_in_list(INQUIRY_SOURCES)
INQUIRY_STAGES_SQL = _sql_in_list(INQUIRY_STAGES)
INQUIRY_EVENT_TYPES_SQL = _sql_in_list(INQUIRY_EVENT_TYPES)
INQUIRY_MESSAGE_DIRECTIONS_SQL = _sql_in_list(INQUIRY_MESSAGE_DIRECTIONS)
INQUIRY_MESSAGE_CHANNELS_SQL = _sql_in_list(INQUIRY_MESSAGE_CHANNELS)
INQUIRY_EVENT_ACTORS_SQL = _sql_in_list(INQUIRY_EVENT_ACTORS)
INQUIRY_SUBMITTED_VIA_SQL = _sql_in_list(INQUIRY_SUBMITTED_VIA)
INQUIRY_SPAM_STATUSES_SQL = _sql_in_list(INQUIRY_SPAM_STATUSES)
INQUIRY_EMPLOYMENT_STATUSES_SQL = _sql_in_list(INQUIRY_EMPLOYMENT_STATUSES)
INQUIRY_SPAM_ASSESSMENT_TYPES_SQL = _sql_in_list(INQUIRY_SPAM_ASSESSMENT_TYPES)
