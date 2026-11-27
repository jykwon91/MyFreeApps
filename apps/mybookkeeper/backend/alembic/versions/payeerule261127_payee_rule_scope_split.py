"""Payee rules can set a scope and a split; transactions record when a person filed them.

- ``classification_rules.transaction_scope``: rental, business or personal, or
  NULL to leave a matching row's scope alone.
- ``classification_rule_split_properties``: the properties a rule splits each
  matching payment evenly across, in order. CASCADE with the rule and with the
  property.
- ``transactions.filed_by_person_at``: when a person last chose the row's
  category, scope or property. A rule never refiles a row that has one.
  Backfilled from the audit log (an edit made in a signed-in request has
  ``changed_by``; syncs and extraction don't), from rows a person entered,
  and from rows a person split.

Downgrade drops all three; the backfill is derived, so nothing is lost.

Revision ID: payeerule261127
Revises: txnsplit261127
Create Date: 2026-11-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "payeerule261127"
down_revision = "txnsplit261127"
branch_labels = None
depends_on = None

_SCOPES_SQL = "('rental', 'business', 'personal')"


def upgrade() -> None:
    op.add_column("classification_rules", sa.Column("transaction_scope", sa.String(10), nullable=True))
    op.create_check_constraint(
        "chk_rule_transaction_scope",
        "classification_rules",
        f"transaction_scope IS NULL OR transaction_scope IN {_SCOPES_SQL}",
    )
    op.create_table(
        "classification_rule_split_properties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.ForeignKeyConstraint(["rule_id"], ["classification_rules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("rule_id", "property_id", name="uq_rule_split_property"),
    )
    op.create_index("ix_rule_split_property", "classification_rule_split_properties", ["property_id"])

    op.add_column("transactions", sa.Column("filed_by_person_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        """
        UPDATE transactions AS t
        SET filed_by_person_at = edits.last_edit
        FROM (
            SELECT record_id, max(changed_at) AS last_edit
            FROM audit_logs
            WHERE table_name = 'transactions'
              AND operation = 'UPDATE'
              AND field_name IN ('category', 'transaction_scope', 'property_id')
              AND changed_by IS NOT NULL
            GROUP BY record_id
        ) AS edits
        WHERE t.id::text = edits.record_id
        """
    )
    op.execute(
        """
        UPDATE transactions AS t
        SET filed_by_person_at = coalesce(t.filed_by_person_at, t.created_at)
        WHERE t.is_manual
           OR EXISTS (SELECT 1 FROM transaction_property_splits s WHERE s.transaction_id = t.id)
        """
    )


def downgrade() -> None:
    op.drop_column("transactions", "filed_by_person_at")
    op.drop_index("ix_rule_split_property", table_name="classification_rule_split_properties")
    op.drop_table("classification_rule_split_properties")
    op.drop_constraint("chk_rule_transaction_scope", "classification_rules", type_="check")
    op.drop_column("classification_rules", "transaction_scope")
