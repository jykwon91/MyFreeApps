"""Every ``system_events.event_type`` the app writes.

The single source of truth for the model's CheckConstraint. A type written by
``record_event`` but missing here is rejected by the database, and
``record_event`` only logs that, so the event is silently lost.
``tests/test_system_event_types.py`` fails when code writes a type not listed.
Adding a type also needs a migration that widens ``ck_system_events_event_type``.
"""
from app.core.sql_in_list import sql_in_list

SYSTEM_EVENT_TYPES: tuple[str, ...] = (
    "rate_limited",
    "extraction_failed",
    "extraction_retried",
    "extraction_completed",
    "extraction_quality_low",
    "category_corrected",
    "property_corrected",
    "rule_applied",
    "worker_error",
    "db_connection_error",
    "api_usage_high",
    "cost_alert",
    "frontend_error",
    "lease_email_sent",
    "lease_email_failed",
    "lease_email_skipped",
    "pii_access",
    "pii_write",
    "pii_delete",
)

SYSTEM_EVENT_TYPES_SQL = sql_in_list(SYSTEM_EVENT_TYPES)
