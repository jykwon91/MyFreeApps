"""Loan payees: payees whose payments are a mortgage or a loan.

``loan_payees`` remembers, per workspace, a payee the person said is paid for
a mortgage or a loan, so every payment to it counts under that heading in
Cash flow and Monthly expenses. Additive; nothing on ``transactions`` changes.

Revision ID: loanpayee261127
Revises: perstransfer261125
Create Date: 2026-11-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "loanpayee261127"
down_revision = "perstransfer261125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "loan_payees",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("normalized_payee", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("organization_id", "normalized_payee", name="uq_loan_payees_org_payee"),
        sa.CheckConstraint("normalized_payee <> ''", name="chk_loan_payees_payee"),
        sa.CheckConstraint("kind IN ('mortgage', 'loan')", name="chk_loan_payees_kind"),
    )
    op.create_index("ix_loan_payees_created_by", "loan_payees", ["created_by_user_id"])


def downgrade() -> None:
    op.drop_index("ix_loan_payees_created_by", table_name="loan_payees")
    op.drop_table("loan_payees")
