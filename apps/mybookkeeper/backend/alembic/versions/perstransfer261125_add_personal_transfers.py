"""Personal transfers: a transaction status, the status it had, remembered senders.

- ``transactions.status`` admits ``personal_transfer``: money between the
  person and a friend or relative, kept on file but never income or spending.
  Every total already counts only ``approved`` rows, so no total needs a new
  filter. ``status_before_personal_transfer`` keeps what the status was, so
  un-marking restores it exactly.
- ``personal_transfer_senders``: senders whose payments are always personal
  transfers, so they never reach Payment Review again.
- ``rent_attribution_review_queue.status`` admits ``personal`` (marked a
  personal transfer) and ``dismissed`` (its transaction was deleted). Cards
  whose transaction is already deleted are dismissed here, since deleting
  never resolved them before.

Additive except the dismissal. Downgrade is lossy by necessity: a personal
transfer goes back to the status it had, and ``personal`` / ``dismissed`` cards
become ``rejected``, before the old checks return.

Revision ID: perstransfer261125
Revises: leaseprop261125
Create Date: 2026-11-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "perstransfer261125"
down_revision = "leaseprop261125"
branch_labels = None
depends_on = None

# Frozen copies of the values at the time of this migration.
_OLD_TXN_STATUSES = "('pending', 'approved', 'needs_review', 'duplicate', 'unverified')"
_NEW_TXN_STATUSES = "('pending', 'approved', 'needs_review', 'duplicate', 'unverified', 'personal_transfer')"
_PRIOR_STATUSES = "('pending', 'needs_review', 'unverified', 'approved')"
_OLD_REVIEW_STATUSES = "('pending', 'confirmed', 'rejected')"
_NEW_REVIEW_STATUSES = "('pending', 'confirmed', 'rejected', 'personal', 'dismissed')"


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("status_before_personal_transfer", sa.String(length=20), nullable=True),
    )
    op.drop_constraint("chk_txn_status", "transactions", type_="check")
    op.create_check_constraint("chk_txn_status", "transactions", f"status IN {_NEW_TXN_STATUSES}")
    op.create_check_constraint(
        "chk_txn_personal_transfer_prior_set",
        "transactions",
        "status <> 'personal_transfer' OR status_before_personal_transfer IS NOT NULL",
    )
    op.create_check_constraint(
        "chk_txn_personal_transfer_prior",
        "transactions",
        f"status_before_personal_transfer IS NULL OR status_before_personal_transfer IN {_PRIOR_STATUSES}",
    )

    op.drop_constraint("chk_rarq_status", "rent_attribution_review_queue", type_="check")
    op.create_check_constraint(
        "chk_rarq_status", "rent_attribution_review_queue", f"status IN {_NEW_REVIEW_STATUSES}",
    )
    op.execute(
        "UPDATE rent_attribution_review_queue SET status = 'dismissed', resolved_at = now() "
        "WHERE status = 'pending' AND transaction_id IN "
        "(SELECT id FROM transactions WHERE deleted_at IS NOT NULL)"
    )

    op.create_table(
        "personal_transfer_senders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("normalized_payer_name", sa.String(length=255), nullable=False),
        sa.Column("payer_handle", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "organization_id", "normalized_payer_name", "payer_handle",
            name="uq_personal_transfer_senders_org_name_handle",
        ),
        sa.CheckConstraint("normalized_payer_name <> ''", name="chk_personal_transfer_senders_name"),
    )
    op.create_index(
        "ix_personal_transfer_senders_created_by", "personal_transfer_senders", ["created_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_personal_transfer_senders_created_by", table_name="personal_transfer_senders")
    op.drop_table("personal_transfer_senders")

    op.execute(
        "UPDATE rent_attribution_review_queue SET status = 'rejected' "
        "WHERE status IN ('personal', 'dismissed')"
    )
    op.drop_constraint("chk_rarq_status", "rent_attribution_review_queue", type_="check")
    op.create_check_constraint(
        "chk_rarq_status", "rent_attribution_review_queue", f"status IN {_OLD_REVIEW_STATUSES}",
    )

    op.execute(
        "UPDATE transactions SET status = status_before_personal_transfer "
        "WHERE status = 'personal_transfer'"
    )
    op.drop_constraint("chk_txn_personal_transfer_prior", "transactions", type_="check")
    op.drop_constraint("chk_txn_personal_transfer_prior_set", "transactions", type_="check")
    op.drop_constraint("chk_txn_status", "transactions", type_="check")
    op.create_check_constraint("chk_txn_status", "transactions", f"status IN {_OLD_TXN_STATUSES}")
    op.drop_column("transactions", "status_before_personal_transfer")
