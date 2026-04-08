"""simplify_org_roles_to_owner_admin_user

Revision ID: 8f9c553fd358
Revises: b0f388b2ad76
Create Date: 2026-03-22 12:11:50.310450

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '8f9c553fd358'
down_revision: Union[str, None] = 'b0f388b2ad76'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Consolidate editor and viewer roles into user
    op.execute(
        "UPDATE organization_members SET org_role = 'user' WHERE org_role IN ('editor', 'viewer')"
    )
    op.execute(
        "UPDATE organization_invites SET org_role = 'user' WHERE org_role IN ('editor', 'viewer')"
    )


def downgrade() -> None:
    # Cannot reliably split 'user' back into editor/viewer,
    # so map all 'user' back to 'viewer' as the safer default
    op.execute(
        "UPDATE organization_members SET org_role = 'viewer' WHERE org_role = 'user'"
    )
    op.execute(
        "UPDATE organization_invites SET org_role = 'viewer' WHERE org_role = 'user'"
    )
