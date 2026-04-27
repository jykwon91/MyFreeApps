"""Canonical string values for the Inquiries domain.

Per RENTALS_PLAN.md §4.1: status / category columns use ``String(N)`` plus a
``CheckConstraint``, never ``SQLAlchemy Enum``. These tuples are the single
source of truth — referenced from both the SQLAlchemy model
``CheckConstraint``s and the Alembic migration DDL.
"""

INQUIRY_SOURCES: tuple[str, ...] = ("FF", "TNH", "direct", "other")

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
