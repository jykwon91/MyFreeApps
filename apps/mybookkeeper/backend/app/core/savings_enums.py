"""Canonical string values for the savings research domain.

Enum-like columns are ``String(N)`` plus a ``CheckConstraint``, never
SQLAlchemy ``Enum``. These tuples are the single source of truth for the
models' checks, the migration, the research reply's JSON schema and the API.

``IDEA_CATEGORIES``, ``IDEA_EFFORTS``, ``IDEA_STATUSES`` and ``RUN_STATUSES``
are mirrored in ``api-client/src/constants/savings.ts``: a value added here
MUST be added there in the same PR.
"""
from app.core.sql_in_list import sql_in_list

CATEGORY_CREDIT_CARD = "credit_card"
CATEGORY_BANK_BONUS = "bank_bonus"
CATEGORY_SUBSCRIPTION = "subscription"
CATEGORY_PHONE_INTERNET = "phone_internet"
CATEGORY_INSURANCE = "insurance"
CATEGORY_MORTGAGE = "mortgage"
CATEGORY_UTILITIES = "utilities"
CATEGORY_PROPERTY_TAX = "property_tax"
CATEGORY_OTHER = "other"

IDEA_CATEGORIES: tuple[str, ...] = (
    CATEGORY_CREDIT_CARD,
    CATEGORY_BANK_BONUS,
    CATEGORY_SUBSCRIPTION,
    CATEGORY_PHONE_INTERNET,
    CATEGORY_INSURANCE,
    CATEGORY_MORTGAGE,
    CATEGORY_UTILITIES,
    CATEGORY_PROPERTY_TAX,
    CATEGORY_OTHER,
)

EFFORT_LOW = "low"
EFFORT_MEDIUM = "medium"
EFFORT_HIGH = "high"
IDEA_EFFORTS: tuple[str, ...] = (EFFORT_LOW, EFFORT_MEDIUM, EFFORT_HIGH)

IDEA_STATUS_OPEN = "open"
IDEA_STATUS_DONE = "done"
IDEA_STATUS_DISMISSED = "dismissed"
IDEA_STATUSES: tuple[str, ...] = (IDEA_STATUS_OPEN, IDEA_STATUS_DONE, IDEA_STATUS_DISMISSED)

RUN_STATUS_RUNNING = "running"
RUN_STATUS_SUCCEEDED = "succeeded"
RUN_STATUS_FAILED = "failed"
RUN_STATUSES: tuple[str, ...] = (RUN_STATUS_RUNNING, RUN_STATUS_SUCCEEDED, RUN_STATUS_FAILED)

RUN_TRIGGER_SCHEDULED = "scheduled"
RUN_TRIGGER_MANUAL = "manual"
RUN_TRIGGERS: tuple[str, ...] = (RUN_TRIGGER_SCHEDULED, RUN_TRIGGER_MANUAL)

# A run's ``error_type`` when the failure is ours rather than Anthropic's.
RUN_ERROR_INTERRUPTED = "interrupted"
RUN_ERROR_UNPARSEABLE = "unparseable_reply"
RUN_ERROR_NOT_CONFIGURED = "not_configured"
RUN_ERROR_INTERNAL = "internal_error"

IDEA_CATEGORIES_SQL = sql_in_list(IDEA_CATEGORIES)
IDEA_EFFORTS_SQL = sql_in_list(IDEA_EFFORTS)
IDEA_STATUSES_SQL = sql_in_list(IDEA_STATUSES)
RUN_STATUSES_SQL = sql_in_list(RUN_STATUSES)
RUN_TRIGGERS_SQL = sql_in_list(RUN_TRIGGERS)
