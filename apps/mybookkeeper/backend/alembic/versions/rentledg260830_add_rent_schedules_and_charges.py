"""add rent_schedules + rent_charges (tenant rent ledger)

Records the "what is owed" side of tenant rent, which nothing in the schema
captured before: ``properties.Lease.monthly_rent`` hangs off the vestigial
``properties.Tenant`` model the live Tenants page does not use, and
``signed_leases.values`` is free-form JSONB keyed by host-defined placeholders.

Both tables key on ``applicant_id`` — the same key the attribution pipeline
already writes onto ``transactions`` — so charges and payments join directly.
Payments are NOT copied into a new table, and the charge-to-payment mapping is
computed by a FIFO allocator on read rather than stored.

Purely additive: no existing table is touched, so a deploy that has not yet
created a schedule behaves exactly as before.

Revision ID: rentledg260830
Revises: wmroom260823
Create Date: 2026-08-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "rentledg260830"
down_revision: Union[str, None] = "wmroom260823"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kept in lockstep with app/core/rent_ledger_enums.py.
_CADENCES_SQL = "('monthly', 'weekly', 'biweekly')"
_CHARGE_TYPES_SQL = "('rent', 'late_fee', 'utility_reimbursement', 'deposit', 'other')"


def upgrade() -> None:
    op.create_table(
        "rent_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
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
            "applicant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("applicants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "property_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("properties.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("cadence", sa.String(length=12), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("grace_days", sa.SmallInteger(), nullable=True),
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
            f"cadence IN {_CADENCES_SQL}", name="chk_rent_schedule_cadence",
        ),
        sa.CheckConstraint("amount >= 0", name="chk_rent_schedule_amount_non_negative"),
        sa.CheckConstraint(
            "grace_days IS NULL OR grace_days >= 0",
            name="chk_rent_schedule_grace_non_negative",
        ),
        sa.CheckConstraint(
            "end_date IS NULL OR end_date >= start_date",
            name="chk_rent_schedule_date_order",
        ),
    )
    # No unique index on applicant_id: a rent increase leaves two live
    # schedules (old one closed by end_date, new one starting the next day).
    # The real invariant — live schedules for one applicant never overlap — is
    # a range constraint needing EXCLUDE ... USING gist (btree_gist, no SQLite
    # equivalent), so it is enforced in rent_schedule_service instead.
    op.create_index(
        "ix_rent_schedules_applicant_start",
        "rent_schedules",
        ["applicant_id", "start_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_rent_schedules_org_active",
        "rent_schedules",
        ["organization_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_rent_schedules_property_id", "rent_schedules", ["property_id"],
    )

    op.create_table(
        "rent_charges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
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
            "applicant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("applicants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "schedule_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rent_schedules.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "charge_type",
            sa.String(length=24),
            nullable=False,
            server_default="rent",
        ),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("waived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("waived_reason", sa.Text(), nullable=True),
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
            f"charge_type IN {_CHARGE_TYPES_SQL}", name="chk_rent_charge_type",
        ),
        sa.CheckConstraint("amount >= 0", name="chk_rent_charge_amount_non_negative"),
        sa.CheckConstraint(
            "period_end >= period_start", name="chk_rent_charge_period_order",
        ),
        sa.CheckConstraint(
            "(waived_at IS NULL) OR (waived_reason IS NOT NULL)",
            name="chk_rent_charge_waive_paired",
        ),
    )
    # Makes charge generation idempotent — re-running the generator for a
    # schedule can never duplicate a period.
    op.create_index(
        "uq_rent_charges_schedule_period",
        "rent_charges",
        ["schedule_id", "period_start"],
        unique=True,
        postgresql_where=sa.text("schedule_id IS NOT NULL AND deleted_at IS NULL"),
    )
    op.create_index(
        "ix_rent_charges_applicant_due",
        "rent_charges",
        ["applicant_id", "due_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_rent_charges_org_due",
        "rent_charges",
        ["organization_id", "due_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("ix_rent_charges_schedule_id", "rent_charges", ["schedule_id"])


def downgrade() -> None:
    op.drop_index("ix_rent_charges_schedule_id", table_name="rent_charges")
    op.drop_index("ix_rent_charges_org_due", table_name="rent_charges")
    op.drop_index("ix_rent_charges_applicant_due", table_name="rent_charges")
    op.drop_index("uq_rent_charges_schedule_period", table_name="rent_charges")
    op.drop_table("rent_charges")
    op.drop_index("ix_rent_schedules_property_id", table_name="rent_schedules")
    op.drop_index("ix_rent_schedules_org_active", table_name="rent_schedules")
    op.drop_index("ix_rent_schedules_applicant_start", table_name="rent_schedules")
    op.drop_table("rent_schedules")
