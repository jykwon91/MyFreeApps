"""fix audit log timezone

Revision ID: fix_audit_log_timezone
Revises: 379f7e27897a
Create Date: 2026-03-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'fix_audit_log_timezone'
down_revision = '379f7e27897a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'audit_logs', 'changed_at',
        type_=sa.DateTime(timezone=True),
        existing_type=sa.DateTime(),
        postgresql_using="changed_at AT TIME ZONE 'UTC'",
    )


def downgrade() -> None:
    op.alter_column(
        'audit_logs', 'changed_at',
        type_=sa.DateTime(),
        existing_type=sa.DateTime(timezone=True),
        postgresql_using="changed_at AT TIME ZONE 'UTC'",
    )
