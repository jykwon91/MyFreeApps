"""add_activity_tax_profile_tax_year_profile

Revision ID: 76b63dd74f54
Revises: 45cb8eebb757
Create Date: 2026-03-22 09:52:47.053559

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = '76b63dd74f54'
down_revision: Union[str, None] = '45cb8eebb757'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Create activities table ---
    op.create_table(
        'activities',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('activity_type', sa.String(30), nullable=False),
        sa.Column('label', sa.String(255), nullable=False),
        sa.Column('tax_form', sa.String(30), nullable=False),
        sa.Column('property_id', UUID(as_uuid=True), sa.ForeignKey('properties.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('organization_id', 'property_id', name='uq_activity_org_property'),
    )

    # --- Create tax_profiles table ---
    op.create_table(
        'tax_profiles',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tax_situations', JSONB, server_default='[]', nullable=False),
        sa.Column('filing_status', sa.String(30), nullable=True),
        sa.Column('dependents_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('onboarding_completed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('organization_id', name='uq_tax_profile_org'),
    )

    # --- Create tax_year_profiles table ---
    op.create_table(
        'tax_year_profiles',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tax_year', sa.SmallInteger(), nullable=False),
        sa.Column('filing_status', sa.String(30), nullable=True),
        sa.Column('dependents_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('property_use_days', JSONB, server_default='{}', nullable=False),
        sa.Column('home_office_sqft', sa.Integer(), nullable=True),
        sa.Column('home_total_sqft', sa.Integer(), nullable=True),
        sa.Column('business_mileage', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('organization_id', 'tax_year', name='uq_tax_year_profile_org_year'),
    )

    # --- Add activity_id to transactions ---
    op.add_column('transactions', sa.Column('activity_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_txn_activity', 'transactions', 'activities', ['activity_id'], ['id'], ondelete='SET NULL')
    op.create_index(
        'ix_txn_org_activity_date', 'transactions',
        ['organization_id', 'activity_id', 'transaction_date'],
        postgresql_where=sa.text('deleted_at IS NULL'),
    )

    # --- Add activity_id to tax_form_instances ---
    op.add_column('tax_form_instances', sa.Column('activity_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_tfi_activity', 'tax_form_instances', 'activities', ['activity_id'], ['id'], ondelete='SET NULL')

    # --- Update category CHECK constraint to include security_deposit ---
    op.drop_constraint('chk_txn_category', 'transactions')
    op.create_check_constraint(
        'chk_txn_category', 'transactions',
        "category IN ("
        "'rental_revenue', 'cleaning_fee_revenue', "
        "'maintenance', 'contract_work', 'cleaning_expense', 'utilities', "
        "'management_fee', 'insurance', 'mortgage_interest', 'mortgage_principal', "
        "'taxes', 'channel_fee', 'advertising', 'legal_professional', 'travel', "
        "'furnishings', 'other_expense', 'uncategorized', 'security_deposit'"
        ")",
    )

    # --- Update type_category CHECK to allow security_deposit as income ---
    op.drop_constraint('chk_txn_type_category', 'transactions')
    op.create_check_constraint(
        'chk_txn_type_category', 'transactions',
        "(transaction_type = 'income' AND category IN ("
        "'rental_revenue', 'cleaning_fee_revenue', 'uncategorized', 'security_deposit'"
        ")) OR "
        "(transaction_type = 'expense' AND category NOT IN ("
        "'rental_revenue', 'cleaning_fee_revenue', 'security_deposit'"
        "))",
    )

    # --- Backfill: Activity per existing Property ---
    op.execute(sa.text("""
        INSERT INTO activities (id, organization_id, activity_type, label, tax_form, property_id)
        SELECT gen_random_uuid(), p.organization_id, 'rental_property', p.name, 'schedule_e', p.id
        FROM properties p
        WHERE p.organization_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.property_id = p.id)
    """))

    # --- Backfill: activity_id on transactions from property_id ---
    op.execute(sa.text("""
        UPDATE transactions t
        SET activity_id = a.id
        FROM activities a
        WHERE a.property_id = t.property_id
        AND t.activity_id IS NULL
        AND t.property_id IS NOT NULL
    """))

    # --- Backfill: TaxProfile per existing Organization ---
    op.execute(sa.text("""
        INSERT INTO tax_profiles (id, organization_id, tax_situations, onboarding_completed)
        SELECT gen_random_uuid(), o.id, '["rental_property"]'::jsonb, true
        FROM organizations o
        WHERE NOT EXISTS (SELECT 1 FROM tax_profiles tp WHERE tp.organization_id = o.id)
    """))


def downgrade() -> None:
    # Restore original CHECK constraints
    op.drop_constraint('chk_txn_type_category', 'transactions')
    op.create_check_constraint(
        'chk_txn_type_category', 'transactions',
        "(transaction_type = 'income' AND category IN ("
        "'rental_revenue', 'cleaning_fee_revenue', 'uncategorized'"
        ")) OR "
        "(transaction_type = 'expense' AND category NOT IN ("
        "'rental_revenue', 'cleaning_fee_revenue'"
        "))",
    )

    op.drop_constraint('chk_txn_category', 'transactions')
    op.create_check_constraint(
        'chk_txn_category', 'transactions',
        "category IN ("
        "'rental_revenue', 'cleaning_fee_revenue', "
        "'maintenance', 'contract_work', 'cleaning_expense', 'utilities', "
        "'management_fee', 'insurance', 'mortgage_interest', 'mortgage_principal', "
        "'taxes', 'channel_fee', 'advertising', 'legal_professional', 'travel', "
        "'furnishings', 'other_expense', 'uncategorized'"
        ")",
    )

    op.drop_constraint('fk_tfi_activity', 'tax_form_instances')
    op.drop_column('tax_form_instances', 'activity_id')

    op.drop_index('ix_txn_org_activity_date', 'transactions')
    op.drop_constraint('fk_txn_activity', 'transactions')
    op.drop_column('transactions', 'activity_id')

    op.drop_table('tax_year_profiles')
    op.drop_table('tax_profiles')
    op.drop_table('activities')
