"""add_plaid_integration

Revision ID: p1a2d3i4n5t6
Revises: f8a9b0c1d2e3
Create Date: 2026-03-19 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'p1a2d3i4n5t6'
down_revision = 'f8a9b0c1d2e3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New columns on transactions
    op.add_column('transactions', sa.Column('external_id', sa.String(255), nullable=True))
    op.add_column('transactions', sa.Column('external_source', sa.String(50), nullable=True))
    op.add_column('transactions', sa.Column('is_pending', sa.Boolean(), nullable=False, server_default='false'))
    op.create_index(
        'uq_txn_external',
        'transactions',
        ['organization_id', 'external_source', 'external_id'],
        unique=True,
        postgresql_where=sa.text('external_id IS NOT NULL'),
    )

    # PlaidItem table
    op.create_table(
        'plaid_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('plaid_item_id', sa.String(255), unique=True, nullable=False),
        sa.Column('access_token', sa.String(2000), nullable=False),
        sa.Column('institution_id', sa.String(255), nullable=True),
        sa.Column('institution_name', sa.String(255), nullable=True),
        sa.Column('cursor', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), server_default='active', nullable=False),
        sa.Column('error_code', sa.String(255), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # PlaidAccount table
    op.create_table(
        'plaid_accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('plaid_item_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('plaid_items.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('plaid_account_id', sa.String(255), nullable=False),
        sa.Column('property_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('properties.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('official_name', sa.String(255), nullable=True),
        sa.Column('account_type', sa.String(50), nullable=False),
        sa.Column('account_subtype', sa.String(50), nullable=True),
        sa.Column('mask', sa.String(10), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('plaid_item_id', 'plaid_account_id', name='uq_plaid_account_item'),
    )


def downgrade() -> None:
    op.drop_table('plaid_accounts')
    op.drop_table('plaid_items')
    op.drop_index('uq_txn_external', table_name='transactions')
    op.drop_column('transactions', 'is_pending')
    op.drop_column('transactions', 'external_source')
    op.drop_column('transactions', 'external_id')
