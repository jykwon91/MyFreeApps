"""add frontend_error event type

Revision ID: j4k5l6m7n8o9
Revises: 673c6c598057
Create Date: 2026-03-22
"""
from alembic import op

revision = "j4k5l6m7n8o9"
down_revision = "673c6c598057"
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
        "'api_usage_high', 'cost_alert', 'frontend_error')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_system_events_event_type", "system_events", type_="check")
    op.create_check_constraint(
        "ck_system_events_event_type",
        "system_events",
        "event_type IN ('rate_limited', 'extraction_failed', 'extraction_retried', "
        "'extraction_completed', 'extraction_quality_low', 'category_corrected', "
        "'property_corrected', 'rule_applied', 'worker_error', 'db_connection_error', "
        "'api_usage_high', 'cost_alert')",
    )
