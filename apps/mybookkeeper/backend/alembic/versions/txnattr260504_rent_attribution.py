"""rent payment attribution + review queue

Adds:
- transactions.applicant_id     — FK to applicants, SET NULL on delete
- transactions.attribution_source — how the link was established
- rent_attribution_review_queue — fuzzy/unmatched payments awaiting host review
- transactions.payer_name       — AI-extracted sender name for matching

Revision ID: txnattr260504
Revises: z0a1b2c3d4e5
Create Date: 2026-05-04 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "txnattr260504"
down_revision: Union[str, None] = "insur260504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- transactions: add applicant_id, attribution_source, payer_name --------
    op.add_column(
        "transactions",
        sa.Column(
            "applicant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("applicants.id", ondelete="SET NULL", name="fk_txn_applicant"),
            nullable=True,
        ),
    )
    op.add_column(
        "transactions",
        sa.Column(
            "attribution_source",
            sa.String(20),
            sa.CheckConstraint(
                "attribution_source IS NULL OR attribution_source IN "
                "('auto_exact', 'auto_fuzzy_confirmed', 'manual')",
                name="chk_txn_attribution_source",
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "transactions",
        sa.Column("payer_name", sa.String(255), nullable=True),
    )

    # Partial index — most transactions have no applicant link
    op.create_index(
        "ix_txn_applicant_id_partial",
        "transactions",
        ["applicant_id"],
        postgresql_where=sa.text("applicant_id IS NOT NULL"),
    )

    # -- rent_attribution_review_queue -----------------------------------------
    op.create_table(
        "rent_attribution_review_queue",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
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
        ),
        sa.Column(
            "proposed_applicant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("applicants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "confidence",
            sa.String(10),
            sa.CheckConstraint(
                "confidence IN ('fuzzy', 'unmatched')",
                name="chk_rarq_confidence",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(15),
            sa.CheckConstraint(
                "status IN ('pending', 'confirmed', 'rejected')",
                name="chk_rarq_status",
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        # Unique — one review entry per transaction max
        sa.UniqueConstraint("transaction_id", name="uq_rarq_transaction"),
    )

    op.create_index(
        "ix_rarq_org_status",
        "rent_attribution_review_queue",
        ["organization_id", "status"],
        postgresql_where=sa.text("deleted_at IS NULL AND status = 'pending'"),
    )
    op.create_index(
        "ix_rarq_transaction",
        "rent_attribution_review_queue",
        ["transaction_id"],
    )
    op.create_index(
        "ix_rarq_org_id",
        "rent_attribution_review_queue",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_rarq_org_id", table_name="rent_attribution_review_queue")
    op.drop_index("ix_rarq_transaction", table_name="rent_attribution_review_queue")
    op.drop_index("ix_rarq_org_status", table_name="rent_attribution_review_queue")
    op.drop_table("rent_attribution_review_queue")

    op.drop_index("ix_txn_applicant_id_partial", table_name="transactions")
    op.drop_column("transactions", "payer_name")
    op.drop_column("transactions", "attribution_source")
    op.drop_column("transactions", "applicant_id")
