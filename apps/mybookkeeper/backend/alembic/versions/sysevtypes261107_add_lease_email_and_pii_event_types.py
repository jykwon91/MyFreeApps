"""Allow the lease-email and taxpayer-PII system event types.

``lease_email_service`` writes ``lease_email_sent`` / ``_failed`` / ``_skipped``
and ``taxpayer_profile_service`` writes ``pii_access`` / ``pii_write`` /
``pii_delete``, but ``ck_system_events_event_type`` never allowed them, so every
one was rejected and dropped (``record_event`` only logs the failure).

Revision ID: sysevtypes261107
Revises: intgorgkey261106
Create Date: 2026-11-07 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sysevtypes261107"
down_revision: Union[str, None] = "intgorgkey261106"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PREVIOUS_TYPES = (
    "'rate_limited', 'extraction_failed', 'extraction_retried', "
    "'extraction_completed', 'extraction_quality_low', 'category_corrected', "
    "'property_corrected', 'rule_applied', 'worker_error', 'db_connection_error', "
    "'api_usage_high', 'cost_alert', 'frontend_error'"
)
_ADDED_TYPES = (
    "'lease_email_sent', 'lease_email_failed', 'lease_email_skipped', "
    "'pii_access', 'pii_write', 'pii_delete'"
)


def upgrade() -> None:
    op.drop_constraint("ck_system_events_event_type", "system_events", type_="check")
    op.create_check_constraint(
        "ck_system_events_event_type",
        "system_events",
        f"event_type IN ({_PREVIOUS_TYPES}, {_ADDED_TYPES})",
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM system_events WHERE event_type IN ({_ADDED_TYPES})")
    op.drop_constraint("ck_system_events_event_type", "system_events", type_="check")
    op.create_check_constraint(
        "ck_system_events_event_type",
        "system_events",
        f"event_type IN ({_PREVIOUS_TYPES})",
    )
