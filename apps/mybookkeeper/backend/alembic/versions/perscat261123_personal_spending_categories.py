"""Personal spending categories and transaction scope.

Three additions in one migration because they're tightly coupled:

* ``spending_categories`` — user-defined personal spending categories, scoped
  to the organization.  10 defaults seeded per org via a data migration.
* ``transactions.transaction_scope`` — 'rental' | 'business' | 'personal'.
  Every existing row receives 'rental' via a server-side default.
* ``transactions.spending_category_id`` — nullable FK to spending_categories,
  SET NULL when a category is deleted.  Only populated for personal-scope rows.

Personal rows can never carry tax fields, and only personal rows carry a
spending category (``chk_txn_personal_not_tax``,
``chk_txn_spending_category_personal``). Every existing row is rental, so
both hold from the start.

Downgrade drops the table, so the seeded categories go with it.

Revision ID: perscat261123
Revises: finacct261123
Create Date: 2026-11-23
"""
from __future__ import annotations

import datetime as _dt
import uuid as _uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Frozen copies: a migration must not change when the app's constants do.
TRANSACTION_SCOPES_SQL = "('rental', 'business', 'personal')"
DEFAULT_SPENDING_CATEGORIES: tuple[str, ...] = (
    "Groceries",
    "Dining & restaurants",
    "Gas & fuel",
    "Shopping & retail",
    "Entertainment & recreation",
    "Travel & vacation",
    "Health & medical",
    "Subscriptions",
    "Personal utilities",
    "Other personal",
)

revision = "perscat261123"
down_revision = "finacct261123"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. spending_categories table
    op.create_table(
        "spending_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE", name="fk_spending_cat_org"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "length(name) >= 1 AND length(name) <= 100",
            name="chk_spending_category_name_length",
        ),
    )
    op.create_index(
        "uq_spending_category_name_live",
        "spending_categories",
        ["organization_id", "name"],
        unique=True,
        postgresql_where=sa.text("archived_at IS NULL"),
    )
    op.create_index(
        "ix_spending_category_org_live",
        "spending_categories",
        ["organization_id"],
        postgresql_where=sa.text("archived_at IS NULL"),
    )

    # 2. Add transaction_scope to transactions
    op.add_column(
        "transactions",
        sa.Column(
            "transaction_scope",
            sa.String(10),
            nullable=False,
            server_default="rental",
        ),
    )
    op.create_check_constraint(
        "chk_txn_scope",
        "transactions",
        f"transaction_scope IN {TRANSACTION_SCOPES_SQL}",
    )

    # 3. Add spending_category_id FK to transactions
    op.add_column(
        "transactions",
        sa.Column(
            "spending_category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "spending_categories.id",
                ondelete="SET NULL",
                name="fk_txn_spending_category",
            ),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_txn_spending_category_id_partial",
        "transactions",
        ["spending_category_id"],
        postgresql_where=sa.text("spending_category_id IS NOT NULL"),
    )
    op.create_check_constraint(
        "chk_txn_personal_not_tax",
        "transactions",
        "transaction_scope <> 'personal' OR ("
        "NOT tax_relevant AND schedule_e_line IS NULL AND NOT is_capital_improvement"
        ")",
    )
    op.create_check_constraint(
        "chk_txn_spending_category_personal",
        "transactions",
        "spending_category_id IS NULL OR transaction_scope = 'personal'",
    )

    # 4. Seed default categories for every existing organization
    conn = op.get_bind()
    org_rows = conn.execute(sa.text("SELECT id FROM organizations")).fetchall()
    now = _dt.datetime.now(_dt.timezone.utc)
    seed_rows = []
    for (org_id,) in org_rows:
        for name in DEFAULT_SPENDING_CATEGORIES:
            seed_rows.append({
                "id": str(_uuid.uuid4()),
                "organization_id": str(org_id),
                "name": name,
                "is_default": True,
                "created_at": now,
                "updated_at": now,
            })
    if seed_rows:
        conn.execute(
            sa.text(
                "INSERT INTO spending_categories "
                "(id, organization_id, name, is_default, created_at, updated_at) "
                "VALUES (:id, :organization_id, :name, :is_default, :created_at, :updated_at)"
            ),
            seed_rows,
        )


def downgrade() -> None:
    op.drop_constraint("chk_txn_spending_category_personal", "transactions", type_="check")
    op.drop_constraint("chk_txn_personal_not_tax", "transactions", type_="check")
    op.drop_index("ix_txn_spending_category_id_partial", table_name="transactions")
    op.drop_constraint("fk_txn_spending_category", "transactions", type_="foreignkey")
    op.drop_column("transactions", "spending_category_id")
    op.drop_constraint("chk_txn_scope", "transactions", type_="check")
    op.drop_column("transactions", "transaction_scope")
    op.drop_index("ix_spending_category_org_live", table_name="spending_categories")
    op.drop_index("uq_spending_category_name_live", table_name="spending_categories")
    op.drop_table("spending_categories")
