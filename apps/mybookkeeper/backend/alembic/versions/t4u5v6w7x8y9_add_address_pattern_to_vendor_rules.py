"""add address_pattern to vendor_rules

Revision ID: t4u5v6w7x8y9
Revises: s3t4u5v6w7x8
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = 't4u5v6w7x8y9'
down_revision = 's3t4u5v6w7x8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('vendor_rules', sa.Column('address_pattern', sa.String(500), nullable=True))
    op.drop_constraint('uq_vendor_rule_org_pattern', 'vendor_rules', type_='unique')
    op.create_unique_constraint(
        'uq_vendor_rule_org_vendor_address',
        'vendor_rules',
        ['organization_id', 'vendor_pattern', 'address_pattern'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_vendor_rule_org_vendor_address', 'vendor_rules', type_='unique')
    op.create_unique_constraint(
        'uq_vendor_rule_org_pattern',
        'vendor_rules',
        ['organization_id', 'vendor_pattern'],
    )
    op.drop_column('vendor_rules', 'address_pattern')
