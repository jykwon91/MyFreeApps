"""Add user.role column with platform_shared.core.permissions.Role enum.

Foundation slice of the eventual full RBAC port. Adds a single
platform-level role column (ADMIN | USER) so MJH can gate admin-only
routes via ``platform_shared.core.permissions.require_role`` without
needing the full organization + members system in place.

Per-organization roles (when MJH ports the orgs/members system) layer
on top of this — they don't replace it.

The enum is created as a PostgreSQL ENUM type named ``user_role``;
default ``user`` for all existing rows. Downgrade drops the column
and the type.

Revision ID: role260505
Revises: docs260504
Create Date: 2026-05-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "role260505"
down_revision: Union[str, None] = "docs260504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres enum types must be created explicitly before they can be
    # used in ``ALTER TABLE``. ``create_type=False`` on the column
    # prevents alembic from auto-creating the type a second time inline.
    user_role_enum = sa.Enum(
        "admin",
        "user",
        name="user_role",
    )
    user_role_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.Enum("admin", "user", name="user_role", create_type=False),
            nullable=False,
            server_default="user",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "role")
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)
