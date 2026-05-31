"""add payer_alias + auto_alias attribution_source

Revision ID: payeralias260530
Revises: wmanualsend260530
Create Date: 2026-05-30

Payment Review — learned payer -> tenant associations (the "remember for next
time" promise). When the host confirms or manually links a payment to a tenant,
the normalized payer name is remembered here so future payments from that payer
auto-attribute (attribution_source='auto_alias') without review.

Conventions:
- ``source`` is String(20) + CheckConstraint (never SQLAlchemy Enum).
- Tenant isolation via ``organization_id`` (+ ``user_id``), both ON DELETE
  CASCADE; ``applicant_id`` CASCADE so a deleted tenant's aliases go with it.
- UUID PK (python ``uuid.uuid4`` default, matching the sibling tables
  rent_attribution_review_queue / welcome_manual_sends); created_at/updated_at
  carry a server default per the timestamp convention.
- The (organization_id, normalized_payer_name) unique index doubles as the
  Pass-0 lookup index — no separate index created for it.

Also widens ``transactions.chk_txn_attribution_source`` to admit the new
'auto_alias' value (the matching frontend type union is updated in the same PR).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "payeralias260530"
down_revision: Union[str, None] = "wmanualsend260530"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payer_alias",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("normalized_payer_name", sa.String(length=255), nullable=False),
        sa.Column("payer_handle", sa.String(length=255), nullable=True),
        sa.Column("applicant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["applicant_id"], ["applicants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "organization_id", "normalized_payer_name",
            name="uq_payer_alias_org_name",
        ),
        sa.CheckConstraint(
            "source IN ('confirm', 'manual_link')",
            name="chk_payer_alias_source",
        ),
    )
    op.create_index(
        "ix_payer_alias_applicant_id", "payer_alias", ["applicant_id"]
    )

    # Widen the transaction attribution_source enum to admit alias-driven
    # auto-attribution.
    op.drop_constraint("chk_txn_attribution_source", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_attribution_source",
        "transactions",
        "attribution_source IS NULL OR attribution_source IN "
        "('auto_exact', 'auto_fuzzy_confirmed', 'auto_alias', 'manual')",
    )


def downgrade() -> None:
    # Narrow the enum back. This fails if any row already uses 'auto_alias' —
    # expected for an enum-narrowing downgrade; null/re-attribute those rows
    # first if the downgrade is ever needed.
    op.drop_constraint("chk_txn_attribution_source", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_attribution_source",
        "transactions",
        "attribution_source IS NULL OR attribution_source IN "
        "('auto_exact', 'auto_fuzzy_confirmed', 'manual')",
    )

    op.drop_index("ix_payer_alias_applicant_id", table_name="payer_alias")
    op.drop_table("payer_alias")
