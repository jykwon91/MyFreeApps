"""add viewer role and check constraints for org_role columns

Revision ID: x8y9z0a1b2c3
Revises: w7x8y9z0a1b2
Create Date: 2026-04-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "x8y9z0a1b2c3"
down_revision: Union[str, None] = "w7x8y9z0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE organization_members ADD CONSTRAINT ck_org_role_valid "
        "CHECK (org_role IN ('owner', 'admin', 'user', 'viewer'))"
    )
    op.execute(
        "ALTER TABLE organization_invites ADD CONSTRAINT ck_invite_org_role_valid "
        "CHECK (org_role IN ('owner', 'admin', 'user', 'viewer'))"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS ck_org_role_valid"
    )
    op.execute(
        "ALTER TABLE organization_invites DROP CONSTRAINT IF EXISTS ck_invite_org_role_valid"
    )
