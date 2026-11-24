"""Create balance_snapshots; add a person-entered current value to properties.

* ``balance_snapshots`` — one value per source per day: a financial account, a
  mortgage record with no linked account, or a valued property. Exactly one
  source foreign key is set (``chk_balance_snapshot_one_source``), each with
  its own partial unique index on (source, day). Starts empty: history begins
  at the first snapshot, nothing is backfilled.
* ``properties.estimated_value_cents`` / ``estimated_value_as_of`` — nullable,
  both or neither. Every existing property stays without a value.

Purely additive. Downgrade drops the table and the two columns; the values a
person typed and their history go with them.

Revision ID: networth261124
Revises: plaidsync261123
Create Date: 2026-11-24
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "networth261124"
down_revision = "plaidsync261123"
branch_labels = None
depends_on = None

_ONE_SOURCE = (
    "(CASE WHEN financial_account_id IS NULL THEN 0 ELSE 1 END"
    " + CASE WHEN mortgage_id IS NULL THEN 0 ELSE 1 END"
    " + CASE WHEN property_id IS NULL THEN 0 ELSE 1 END) = 1"
)


def _uuid_fk(name: str, target: str, *, nullable: bool) -> sa.Column:
    return sa.Column(
        name,
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey(target, ondelete="CASCADE"),
        nullable=nullable,
    )


def upgrade() -> None:
    op.create_table(
        "balance_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _uuid_fk("organization_id", "organizations.id", nullable=False),
        _uuid_fk("user_id", "users.id", nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        _uuid_fk("financial_account_id", "financial_accounts.id", nullable=True),
        _uuid_fk("mortgage_id", "mortgages.id", nullable=True),
        _uuid_fk("property_id", "properties.id", nullable=True),
        sa.Column("balance_cents", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(),
        ),
        sa.CheckConstraint(_ONE_SOURCE, name="chk_balance_snapshot_one_source"),
    )
    op.create_index(
        "ix_balance_snapshots_organization_id", "balance_snapshots", ["organization_id"],
    )
    op.create_index(
        "ix_balance_snapshots_user_org_date",
        "balance_snapshots",
        ["user_id", "organization_id", "snapshot_date"],
    )
    op.create_index(
        "uq_balance_snapshots_account_day",
        "balance_snapshots",
        ["financial_account_id", "snapshot_date"],
        unique=True,
        postgresql_where=sa.text("financial_account_id IS NOT NULL"),
    )
    op.create_index(
        "uq_balance_snapshots_mortgage_day",
        "balance_snapshots",
        ["mortgage_id", "snapshot_date"],
        unique=True,
        postgresql_where=sa.text("mortgage_id IS NOT NULL"),
    )
    op.create_index(
        "uq_balance_snapshots_property_user_day",
        "balance_snapshots",
        ["property_id", "user_id", "snapshot_date"],
        unique=True,
        postgresql_where=sa.text("property_id IS NOT NULL"),
    )

    op.add_column("properties", sa.Column("estimated_value_cents", sa.BigInteger(), nullable=True))
    op.add_column("properties", sa.Column("estimated_value_as_of", sa.Date(), nullable=True))
    op.create_check_constraint(
        "chk_prop_estimated_value",
        "properties",
        "(estimated_value_cents IS NULL) = (estimated_value_as_of IS NULL)"
        " AND (estimated_value_cents IS NULL OR estimated_value_cents >= 0)",
    )


def downgrade() -> None:
    op.drop_constraint("chk_prop_estimated_value", "properties", type_="check")
    op.drop_column("properties", "estimated_value_as_of")
    op.drop_column("properties", "estimated_value_cents")

    op.drop_index("uq_balance_snapshots_property_user_day", table_name="balance_snapshots")
    op.drop_index("uq_balance_snapshots_mortgage_day", table_name="balance_snapshots")
    op.drop_index("uq_balance_snapshots_account_day", table_name="balance_snapshots")
    op.drop_index("ix_balance_snapshots_user_org_date", table_name="balance_snapshots")
    op.drop_index("ix_balance_snapshots_organization_id", table_name="balance_snapshots")
    op.drop_table("balance_snapshots")
