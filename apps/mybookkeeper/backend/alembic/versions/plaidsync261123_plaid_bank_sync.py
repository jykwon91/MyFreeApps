"""Plaid bank sync: plaid_items, account links, default scope, source category.

* ``plaid_items`` — one row per bank connection, org + user scoped. The
  access token is stored as Fernet ciphertext (``access_token_encrypted``)
  with its ``key_version``, like ``integrations``.
* ``financial_accounts.plaid_item_id`` (FK, SET NULL) + ``plaid_account_id``,
  unique per item — which Plaid account a row is synced from.
* ``financial_accounts.default_transaction_scope`` — the scope synced rows
  start with. Existing accounts get ``personal``, the same default a new
  account gets; nothing synced into them yet, so nothing changes meaning.
* ``transactions.external_category`` — the source's own category.

Purely additive: every new column is nullable or has a server default, and no
existing value is rewritten. Downgrade drops it all; it refuses while any
bank connection exists rather than silently deleting the person's access
tokens without revoking them at Plaid — disconnect them in the app first.

Revision ID: plaidsync261123
Revises: perscat261123
Create Date: 2026-11-23
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.plaid_item_enums import PLAID_ITEM_STATUSES_SQL
from app.core.spending_category_enums import TRANSACTION_SCOPES_SQL

revision = "plaidsync261123"
down_revision = "perscat261123"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plaid_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plaid_item_id", sa.String(100), nullable=False),
        sa.Column("institution_id", sa.String(50), nullable=True),
        sa.Column("institution_name", sa.String(255), nullable=True),
        sa.Column("access_token_encrypted", sa.Text(), nullable=False),
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("transactions_cursor", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("error_type", sa.String(50), nullable=True),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            f"status IN {PLAID_ITEM_STATUSES_SQL}", name="chk_plaid_item_status",
        ),
    )
    op.create_index("ix_plaid_items_organization_id", "plaid_items", ["organization_id"])
    op.create_index("ix_plaid_items_user_id", "plaid_items", ["user_id"])
    op.create_index("ix_plaid_items_org_user", "plaid_items", ["organization_id", "user_id"])
    op.create_index(
        "uq_plaid_items_plaid_item_id", "plaid_items", ["plaid_item_id"], unique=True,
    )

    op.add_column(
        "financial_accounts",
        sa.Column(
            "default_transaction_scope", sa.String(10), nullable=False,
            server_default="personal",
        ),
    )
    op.add_column(
        "financial_accounts",
        sa.Column("plaid_item_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "financial_accounts",
        sa.Column("plaid_account_id", sa.String(100), nullable=True),
    )
    op.create_foreign_key(
        "financial_accounts_plaid_item_id_fkey", "financial_accounts", "plaid_items",
        ["plaid_item_id"], ["id"], ondelete="SET NULL",
    )
    op.create_check_constraint(
        "chk_fin_account_default_scope", "financial_accounts",
        f"default_transaction_scope IN {TRANSACTION_SCOPES_SQL}",
    )
    op.create_index(
        "uq_fin_accounts_plaid_account",
        "financial_accounts",
        ["plaid_item_id", "plaid_account_id"],
        unique=True,
        postgresql_where=sa.text("plaid_item_id IS NOT NULL"),
    )

    op.add_column(
        "transactions",
        sa.Column("external_category", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    connections = op.get_bind().execute(
        sa.text("SELECT count(*) FROM plaid_items"),
    ).scalar_one()
    if connections:
        raise RuntimeError(
            f"{connections} bank connection(s) exist; disconnect them in the app "
            "(which revokes them at Plaid) before downgrading.",
        )

    op.drop_column("transactions", "external_category")

    op.drop_index("uq_fin_accounts_plaid_account", table_name="financial_accounts")
    op.drop_constraint("chk_fin_account_default_scope", "financial_accounts", type_="check")
    op.drop_constraint(
        "financial_accounts_plaid_item_id_fkey", "financial_accounts", type_="foreignkey",
    )
    op.drop_column("financial_accounts", "plaid_account_id")
    op.drop_column("financial_accounts", "plaid_item_id")
    op.drop_column("financial_accounts", "default_transaction_scope")

    op.drop_index("uq_plaid_items_plaid_item_id", table_name="plaid_items")
    op.drop_index("ix_plaid_items_org_user", table_name="plaid_items")
    op.drop_index("ix_plaid_items_user_id", table_name="plaid_items")
    op.drop_index("ix_plaid_items_organization_id", table_name="plaid_items")
    op.drop_table("plaid_items")
