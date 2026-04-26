"""add system_events table and document retry columns

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 's3t4u5v6w7x8'
down_revision = 'r2s3t4u5v6w7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'system_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True),
                   sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('message', sa.String(500), nullable=False),
        sa.Column('event_data', postgresql.JSONB, nullable=True),
        sa.Column('resolved', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "event_type IN ('rate_limited', 'extraction_failed', 'extraction_retried', "
            "'extraction_quality_low', 'category_corrected', 'property_corrected', "
            "'rule_applied', 'worker_error', 'db_connection_error', 'api_usage_high')",
            name='ck_system_events_event_type',
        ),
        sa.CheckConstraint(
            "severity IN ('info', 'warning', 'error', 'critical')",
            name='ck_system_events_severity',
        ),
    )
    op.create_index(
        'ix_system_events_org_type_created',
        'system_events',
        ['organization_id', 'event_type', sa.text('created_at DESC')],
    )
    op.create_index(
        'ix_system_events_unresolved',
        'system_events',
        ['resolved', 'severity'],
        postgresql_where=sa.text('resolved = false'),
    )

    op.add_column('documents', sa.Column('retry_count', sa.Integer(), server_default='0', nullable=False))
    op.add_column('documents', sa.Column('next_retry_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'next_retry_at')
    op.drop_column('documents', 'retry_count')
    op.drop_index('ix_system_events_unresolved', table_name='system_events')
    op.drop_index('ix_system_events_org_type_created', table_name='system_events')
    op.drop_table('system_events')
