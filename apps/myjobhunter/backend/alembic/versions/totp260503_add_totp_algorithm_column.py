"""Add totp_algorithm column to users (SHA-256 grace-period migration).

Strategy A from the 2026-05-02 security audit: add ``totp_algorithm`` so the
TOTP verifier can use the algorithm the user enrolled with.  Existing users
keep ``sha1`` (their authenticator app was configured with a SHA-1 QR code);
all new enrollments after this migration write ``sha256``.

A follow-up comms campaign (target: 30 days post-deploy) will email all
``sha1`` users asking them to disable + re-enable 2FA to upgrade.

Revision ID: totp260503
Revises: mjhcovix260502
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa

revision = "totp260503"
down_revision = "mjhcovix260502"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "totp_algorithm",
            sa.String(10),
            nullable=False,
            server_default="sha1",
            comment=(
                "HMAC algorithm used when this user enrolled in TOTP. "
                "'sha1' = grandfathered (enrolled before 2026-05-03); "
                "'sha256' = all new enrollments. "
                "Read by the TOTP verifier to pick the matching pyotp digest."
            ),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "totp_algorithm")
