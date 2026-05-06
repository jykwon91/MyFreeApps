"""platform_invites — replace plaintext token with sha256 hash.

Security hardening landed in PR fix/myjobhunter-invite-security-hardening.
The original ``inv260505`` migration stored the invite token in the
``token`` column as plaintext. A read-only DB compromise (backup, replica,
log snapshot) would hand out usable single-use registration grants. The
fix is to store ``sha256(token)`` and never persist the raw value — the
raw token is emitted exactly once into the recipient's email and never
again retrievable.

Migration shape:
  * Hard-delete every existing row. The feature is hours old (shipped
    earlier 2026-05-05) so we are deliberately wiping rather than trying
    to back-fill hashes for accepted-but-historical rows. Any pending
    invites in flight at deploy time become unusable; the operator must
    re-issue them. Acceptable since the feature has zero non-trivial
    production usage at the time this migration deploys.
  * Drop the unique index on the old plaintext ``token`` column.
  * Drop the ``token`` column.
  * Add a new ``token_hash VARCHAR(64) NOT NULL`` column (64 hex chars
    = sha256 hex digest).
  * Add a unique index on ``token_hash`` so lookups stay O(log n) and
    duplicate-hash collisions raise IntegrityError.

Downgrade restores the plaintext column and an empty table.

Revision ID: inv260506
Revises: inv260505
Create Date: 2026-05-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "inv260506"
down_revision: Union[str, None] = "inv260505"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Wipe all rows — see module docstring for the why. Pending invites
    # become unusable; accepted rows lose their (already-spent) tokens.
    op.execute("DELETE FROM platform_invites")

    op.drop_index("ix_platform_invites_token", table_name="platform_invites")
    op.drop_column("platform_invites", "token")

    op.add_column(
        "platform_invites",
        sa.Column("token_hash", sa.String(64), nullable=False),
    )
    op.create_index(
        "ix_platform_invites_token_hash",
        "platform_invites",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_platform_invites_token_hash", table_name="platform_invites"
    )
    op.drop_column("platform_invites", "token_hash")

    op.add_column(
        "platform_invites",
        sa.Column("token", sa.String(255), nullable=False, server_default=""),
    )
    op.alter_column("platform_invites", "token", server_default=None)
    op.create_index(
        "ix_platform_invites_token",
        "platform_invites",
        ["token"],
        unique=True,
    )
