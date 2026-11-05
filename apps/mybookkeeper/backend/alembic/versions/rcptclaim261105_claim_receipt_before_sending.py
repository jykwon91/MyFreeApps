"""Claim a pending rent receipt before emailing it.

Adds the ``sending`` status and the two columns that identify the claim: the
RFC 822 Message-ID the email is sent with (so a send whose outcome was unknown
can be looked up in Gmail) and when the claim was taken.

Downgrade refuses while any receipt is mid-send: turning those rows back into
``pending`` could email the tenant twice, and calling them ``sent`` may be
false.

Revision ID: rcptclaim261105
Revises: p3r8s1u6w2y5
"""
import sqlalchemy as sa
from alembic import op

revision = "rcptclaim261105"
down_revision = "p3r8s1u6w2y5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pending_rent_receipts",
        sa.Column("send_message_id", sa.String(255), nullable=True),
    )
    op.add_column(
        "pending_rent_receipts",
        sa.Column("send_claimed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_constraint("chk_pending_rent_receipt_status", "pending_rent_receipts")
    op.create_check_constraint(
        "chk_pending_rent_receipt_status",
        "pending_rent_receipts",
        "status IN ('pending', 'sending', 'sent', 'dismissed')",
    )
    op.create_check_constraint(
        "chk_pending_rent_receipt_sending_claim",
        "pending_rent_receipts",
        "status <> 'sending' OR (send_message_id IS NOT NULL AND send_claimed_at IS NOT NULL)",
    )


def downgrade() -> None:
    in_flight = op.get_bind().execute(
        sa.text("SELECT count(*) FROM pending_rent_receipts WHERE status = 'sending'")
    ).scalar_one()
    if in_flight:
        raise RuntimeError(
            f"{in_flight} rent receipt(s) are mid-send. Retry them from the app "
            "(it checks Gmail and finishes or releases each one) before downgrading."
        )
    op.drop_constraint("chk_pending_rent_receipt_sending_claim", "pending_rent_receipts")
    op.drop_constraint("chk_pending_rent_receipt_status", "pending_rent_receipts")
    op.create_check_constraint(
        "chk_pending_rent_receipt_status",
        "pending_rent_receipts",
        "status IN ('pending', 'sent', 'dismissed')",
    )
    op.drop_column("pending_rent_receipts", "send_claimed_at")
    op.drop_column("pending_rent_receipts", "send_message_id")
