"""add extraction_completed and cost_alert event types

Revision ID: g1h2i3j4k5l6
Revises: f1u2r3n4i5s6
Create Date: 2026-03-21
"""
from alembic import op

revision = "g1h2i3j4k5l6"
down_revision = "f1u2r3n4i5s6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_system_events_event_type", "system_events", type_="check")
    op.create_check_constraint(
        "ck_system_events_event_type",
        "system_events",
        "event_type IN ('rate_limited', 'extraction_failed', 'extraction_retried', "
        "'extraction_completed', 'extraction_quality_low', 'category_corrected', "
        "'property_corrected', 'rule_applied', 'worker_error', 'db_connection_error', "
        "'api_usage_high', 'cost_alert')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_system_events_event_type", "system_events", type_="check")
    op.create_check_constraint(
        "ck_system_events_event_type",
        "system_events",
        "event_type IN ('rate_limited', 'extraction_failed', 'extraction_retried', "
        "'extraction_quality_low', 'category_corrected', 'property_corrected', "
        "'rule_applied', 'worker_error', 'db_connection_error', 'api_usage_high')",
    )
