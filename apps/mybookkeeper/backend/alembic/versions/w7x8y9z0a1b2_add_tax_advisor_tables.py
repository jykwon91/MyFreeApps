"""add tax advisor generation and suggestion tables

Revision ID: w7x8y9z0a1b2
Revises: v6w7x8y9z0a1
Create Date: 2026-04-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'w7x8y9z0a1b2'
down_revision: Union[str, None] = 'e8f9a0b1c2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tax_advisor_generations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tax_return_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('requested_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('model_version', sa.String(length=100), nullable=False),
        sa.Column('suggestion_count', sa.SmallInteger(), nullable=False),
        sa.Column('raw_response', postgresql.JSONB(), nullable=False),
        sa.Column('input_tokens', sa.Integer(), nullable=True),
        sa.Column('output_tokens', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['requested_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tax_return_id'], ['tax_returns.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'tax_advisor_suggestions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('tax_return_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('generation_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('suggestion_key', sa.String(length=100), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('severity', sa.String(length=10), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('estimated_savings', sa.Integer(), nullable=True),
        sa.Column('action', sa.Text(), nullable=False),
        sa.Column('irs_reference', sa.String(length=200), nullable=True),
        sa.Column('confidence', sa.String(length=10), nullable=False),
        sa.Column('affected_properties', postgresql.JSONB(), nullable=True),
        sa.Column('affected_form', sa.String(length=50), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('status_changed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status_changed_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("severity IN ('high', 'medium', 'low')", name='chk_tas_severity'),
        sa.CheckConstraint("confidence IN ('high', 'medium', 'low')", name='chk_tas_confidence'),
        sa.CheckConstraint("status IN ('active', 'dismissed', 'resolved')", name='chk_tas_status'),
        sa.ForeignKeyConstraint(['generation_id'], ['tax_advisor_generations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['status_changed_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tax_return_id'], ['tax_returns.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_index('ix_tas_return_status', 'tax_advisor_suggestions', ['tax_return_id', 'status'])
    op.create_index('ix_tas_org_id', 'tax_advisor_suggestions', ['organization_id'])
    op.create_index('ix_tas_generation', 'tax_advisor_suggestions', ['generation_id'])


def downgrade() -> None:
    op.drop_index('ix_tas_generation', table_name='tax_advisor_suggestions')
    op.drop_index('ix_tas_org_id', table_name='tax_advisor_suggestions')
    op.drop_index('ix_tas_return_status', table_name='tax_advisor_suggestions')
    op.drop_table('tax_advisor_suggestions')
    op.drop_table('tax_advisor_generations')
