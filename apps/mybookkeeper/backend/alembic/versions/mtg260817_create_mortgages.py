"""Create the mortgages table.

Mirrors the shape of ``insurance_policies``: scoped to a property rather than
a listing, soft-deleted, sourced from a document that may later be deleted
without invalidating the terms read off it.

The one column with no counterpart there is ``rate_type``. It is NOT NULL with
no server default on purpose — a loan whose rate might reset is a different
product from one whose rate cannot, and defaulting the unknown case to
``fixed`` would silently promise a comparison the data does not support.

Revision ID: mtg260817
Revises: insfees260814
Create Date: 2026-08-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.mortgage_enums import RATE_TYPES_SQL

revision = "mtg260817"
down_revision = "insfees260814"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mortgages",
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
            "property_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("properties.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("lender", sa.String(255), nullable=True),
        sa.Column("account_number", sa.String(255), nullable=True),
        sa.Column(
            "key_version", sa.BigInteger(), nullable=False, server_default="1",
        ),
        sa.Column("current_balance_cents", sa.BigInteger(), nullable=True),
        sa.Column("statement_date", sa.Date(), nullable=True),
        sa.Column("original_principal_cents", sa.BigInteger(), nullable=True),
        sa.Column("interest_rate", sa.Numeric(6, 3), nullable=True),
        sa.Column("rate_type", sa.String(12), nullable=False),
        sa.Column("fixed_until", sa.Date(), nullable=True),
        sa.Column("maturity_date", sa.Date(), nullable=True),
        sa.Column("term_months", sa.Integer(), nullable=True),
        sa.Column("monthly_principal_cents", sa.BigInteger(), nullable=True),
        sa.Column("monthly_interest_cents", sa.BigInteger(), nullable=True),
        sa.Column("monthly_escrow_cents", sa.BigInteger(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint(
            f"rate_type IN {RATE_TYPES_SQL}", name="chk_mortgage_rate_type",
        ),
        sa.CheckConstraint(
            "fixed_until IS NULL OR rate_type = 'arm'",
            name="chk_mortgage_fixed_until_arm_only",
        ),
        sa.CheckConstraint(
            "interest_rate IS NULL"
            " OR (interest_rate > 0 AND interest_rate < 25)",
            name="chk_mortgage_interest_rate_range",
        ),
        sa.CheckConstraint(
            "(current_balance_cents IS NULL OR current_balance_cents >= 0)"
            " AND (original_principal_cents IS NULL"
            "      OR original_principal_cents > 0)"
            " AND (monthly_principal_cents IS NULL"
            "      OR monthly_principal_cents >= 0)"
            " AND (monthly_interest_cents IS NULL"
            "      OR monthly_interest_cents >= 0)"
            " AND (monthly_escrow_cents IS NULL OR monthly_escrow_cents >= 0)",
            name="chk_mortgage_amounts_valid",
        ),
        sa.CheckConstraint(
            "term_months IS NULL OR (term_months > 0 AND term_months <= 600)",
            name="chk_mortgage_term_months_range",
        ),
        sa.CheckConstraint(
            "(current_balance_cents IS NULL) = (statement_date IS NULL)",
            name="chk_mortgage_balance_as_of_pair",
        ),
    )

    op.create_index("ix_mortgages_user_id", "mortgages", ["user_id"])
    op.create_index(
        "ix_mortgages_organization_id", "mortgages", ["organization_id"],
    )
    op.create_index("ix_mortgages_property_id", "mortgages", ["property_id"])
    op.create_index(
        "ix_mortgages_source_document_id", "mortgages", ["source_document_id"],
    )
    op.create_index(
        "ix_mortgages_org_created_active",
        "mortgages",
        ["organization_id", "created_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_mortgages_org_property_active",
        "mortgages",
        ["organization_id", "property_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_mortgages_org_property_active", table_name="mortgages")
    op.drop_index("ix_mortgages_org_created_active", table_name="mortgages")
    op.drop_index("ix_mortgages_source_document_id", table_name="mortgages")
    op.drop_index("ix_mortgages_property_id", table_name="mortgages")
    op.drop_index("ix_mortgages_organization_id", table_name="mortgages")
    op.drop_index("ix_mortgages_user_id", table_name="mortgages")
    op.drop_table("mortgages")
