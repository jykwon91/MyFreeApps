"""Rent receipt PDF generation + email (Path A + B)

Adds:
- pending_rent_receipts   — queue of receipts awaiting host review/send
- rent_receipt_sequences  — per-landlord-per-year sequence counter
- signed_lease_attachments.kind: adds 'rent_receipt' to the CHECK constraint
- transactions: no schema change (applicant_id already added in txnattr260504)

Revision ID: rcpt260504
Revises: txnattr260504
Create Date: 2026-05-04 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "rcpt260504"
down_revision: Union[str, None] = "merge260504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- pending_rent_receipts --------------------------------------------------
    op.create_table(
        "pending_rent_receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "transaction_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transactions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "applicant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("applicants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "signed_lease_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("signed_leases.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("period_start_date", sa.Date(), nullable=False),
        sa.Column("period_end_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "sent_via_attachment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("signed_lease_attachments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'sent', 'dismissed')",
            name="chk_pending_rent_receipt_status",
        ),
    )
    op.create_index(
        "ix_pending_rent_receipts_org_status",
        "pending_rent_receipts",
        ["organization_id", "status"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_pending_rent_receipts_transaction_id",
        "pending_rent_receipts",
        ["transaction_id"],
    )

    # -- rent_receipt_sequences ------------------------------------------------
    op.create_table(
        "rent_receipt_sequences",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("year", sa.SmallInteger(), primary_key=True, nullable=False),
        sa.Column(
            "last_number",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.UniqueConstraint("user_id", "year", name="uq_rent_receipt_sequence_user_year"),
    )

    # -- signed_lease_attachments: add 'rent_receipt' to kind CHECK -----------
    # Drop the old constraint, recreate with the extended tuple.
    op.drop_constraint(
        "chk_signed_lease_attachment_kind",
        "signed_lease_attachments",
        type_="check",
    )
    op.create_check_constraint(
        "chk_signed_lease_attachment_kind",
        "signed_lease_attachments",
        "kind IN ("
        "'rendered_original', 'signed_lease', 'signed_addendum', "
        "'move_in_inspection', 'move_out_inspection', 'insurance_proof', "
        "'amendment', 'notice', 'rent_receipt', 'other'"
        ")",
    )


def downgrade() -> None:
    # Revert kind CHECK to pre-receipts set
    op.drop_constraint(
        "chk_signed_lease_attachment_kind",
        "signed_lease_attachments",
        type_="check",
    )
    op.create_check_constraint(
        "chk_signed_lease_attachment_kind",
        "signed_lease_attachments",
        "kind IN ("
        "'rendered_original', 'signed_lease', 'signed_addendum', "
        "'move_in_inspection', 'move_out_inspection', 'insurance_proof', "
        "'amendment', 'notice', 'other'"
        ")",
    )

    op.drop_index(
        "ix_pending_rent_receipts_transaction_id",
        table_name="pending_rent_receipts",
    )
    op.drop_index(
        "ix_pending_rent_receipts_org_status",
        table_name="pending_rent_receipts",
    )
    op.drop_table("pending_rent_receipts")
    op.drop_table("rent_receipt_sequences")
