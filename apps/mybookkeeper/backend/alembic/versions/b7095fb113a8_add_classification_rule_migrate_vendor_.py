"""add_classification_rule_migrate_vendor_rules

Revision ID: b7095fb113a8
Revises: 76b63dd74f54
Create Date: 2026-03-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = 'b7095fb113a8'
down_revision: Union[str, None] = '76b63dd74f54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'classification_rules',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('match_type', sa.String(20), nullable=False),
        sa.Column('match_pattern', sa.String(500), nullable=False),
        sa.Column('match_context', sa.String(500), nullable=True),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('property_id', UUID(as_uuid=True), sa.ForeignKey('properties.id', ondelete='SET NULL'), nullable=True),
        sa.Column('activity_id', UUID(as_uuid=True), sa.ForeignKey('activities.id', ondelete='SET NULL'), nullable=True),
        sa.Column('source', sa.String(20), server_default='user_correction', nullable=False),
        sa.Column('priority', sa.SmallInteger(), server_default='0', nullable=False),
        sa.Column('times_applied', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('organization_id', 'match_type', 'match_pattern', 'match_context', name='uq_rule_org_type_pattern_context'),
    )
    op.create_index(
        'ix_rule_lookup', 'classification_rules',
        ['organization_id', 'match_type', 'match_pattern'],
        postgresql_where=sa.text('is_active = true'),
    )

    # Migrate vendor_rules → classification_rules
    op.execute(sa.text("""
        INSERT INTO classification_rules (
            id, organization_id, created_by, match_type, match_pattern, match_context,
            category, property_id, source, times_applied, is_active
        )
        SELECT
            gen_random_uuid(),
            vr.organization_id,
            vr.created_by,
            'vendor',
            vr.vendor_pattern,
            vr.address_pattern,
            vr.category,
            vr.property_id,
            vr.source,
            vr.times_applied,
            true
        FROM vendor_rules vr
    """))


def downgrade() -> None:
    op.drop_index('ix_rule_lookup', 'classification_rules')
    op.drop_table('classification_rules')
