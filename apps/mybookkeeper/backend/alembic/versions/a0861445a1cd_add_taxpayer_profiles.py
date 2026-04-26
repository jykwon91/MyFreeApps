"""add taxpayer_profiles

Revision ID: a0861445a1cd
Revises: fb81fb96aa20
Create Date: 2026-03-30 10:41:01.845504

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a0861445a1cd'
down_revision: Union[str, None] = 'fb81fb96aa20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'taxpayer_profiles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('filer_type', sa.String(length=10), nullable=False),
        sa.Column('encrypted_ssn', sa.String(length=500), nullable=True),
        sa.Column('encrypted_first_name', sa.String(length=500), nullable=True),
        sa.Column('encrypted_last_name', sa.String(length=500), nullable=True),
        sa.Column('encrypted_middle_initial', sa.String(length=500), nullable=True),
        sa.Column('encrypted_date_of_birth', sa.String(length=500), nullable=True),
        sa.Column('encrypted_street_address', sa.String(length=500), nullable=True),
        sa.Column('encrypted_apartment_unit', sa.String(length=500), nullable=True),
        sa.Column('encrypted_city', sa.String(length=500), nullable=True),
        sa.Column('encrypted_state', sa.String(length=500), nullable=True),
        sa.Column('encrypted_zip_code', sa.String(length=500), nullable=True),
        sa.Column('encrypted_phone', sa.String(length=500), nullable=True),
        sa.Column('encrypted_occupation', sa.String(length=500), nullable=True),
        sa.Column('ssn_last_four', sa.String(length=4), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("filer_type IN ('primary', 'spouse')", name='ck_taxpayer_profile_filer_type'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', 'filer_type', name='uq_taxpayer_profile_org_filer'),
    )


def downgrade() -> None:
    op.drop_table('taxpayer_profiles')
