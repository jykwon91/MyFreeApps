"""Canonical string values for the Insurance domain.

Per project convention (RENTALS_PLAN.md §4.1): status / category columns use
``String(N)`` plus a ``CheckConstraint``, never ``SQLAlchemy Enum``. These
tuples are the single source of truth — referenced from both the SQLAlchemy
model ``CheckConstraint``s and the Alembic migration DDL.
"""

# File kinds for insurance policy attachments.
INSURANCE_ATTACHMENT_KINDS: tuple[str, ...] = (
    "policy_document",
    "endorsement",
    "binder",
    "other",
)


def _sql_in_list(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


INSURANCE_ATTACHMENT_KINDS_SQL = _sql_in_list(INSURANCE_ATTACHMENT_KINDS)
