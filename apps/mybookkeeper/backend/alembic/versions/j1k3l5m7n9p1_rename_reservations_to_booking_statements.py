"""Rename reservations table -> booking_statements (and related indexes/constraints/FK)

This is a pure-rename migration that frees the operational `reservations`
namespace for upcoming channel-sync work. The table that today stores
finance-derived rows extracted from PM (property manager) year-end
statements is renamed to `booking_statements` to better describe its role
and to make room for a new operational reservations table that will be
introduced in a follow-up PR.

Zero behavioral change: same columns, same constraints, same indexes —
only names change. The FK column `reconciliation_matches.reservation_id`
is renamed to `booking_statement_id` to match.

Revision ID: j1k3l5m7n9p1
Revises: j2k4l6m8n0p2
Create Date: 2026-04-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "j1k3l5m7n9p1"
down_revision: Union[str, None] = "j2k4l6m8n0p2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Rename the table.
    op.rename_table("reservations", "booking_statements")

    # 2. Rename indexes (postgres requires explicit ALTER INDEX RENAME).
    op.execute("ALTER INDEX ix_res_property_dates RENAME TO ix_bs_property_dates")
    op.execute("ALTER INDEX ix_res_org_checkin RENAME TO ix_bs_org_checkin")
    op.execute("ALTER INDEX ix_res_platform RENAME TO ix_bs_platform")
    op.execute("ALTER INDEX ix_res_transaction RENAME TO ix_bs_transaction")

    # 3. Rename constraints (PK/FK/CHECK/UNIQUE).
    #    Postgres auto-renames the PK index when the table is renamed but the
    #    constraint name keeps its original prefix — rename it to keep things
    #    consistent.
    op.execute(
        "ALTER TABLE booking_statements RENAME CONSTRAINT reservations_pkey TO booking_statements_pkey"
    )
    op.execute(
        "ALTER TABLE booking_statements RENAME CONSTRAINT chk_res_dates TO chk_bs_dates"
    )
    op.execute(
        "ALTER TABLE booking_statements RENAME CONSTRAINT chk_res_platform TO chk_bs_platform"
    )
    op.execute(
        "ALTER TABLE booking_statements RENAME CONSTRAINT chk_res_gross_when_platform TO chk_bs_gross_when_platform"
    )
    op.execute(
        "ALTER TABLE booking_statements RENAME CONSTRAINT uq_res_org_code TO uq_bs_org_code"
    )

    # 4. Rename the FK column on reconciliation_matches and its index/constraint.
    op.alter_column(
        "reconciliation_matches",
        "reservation_id",
        new_column_name="booking_statement_id",
    )
    op.execute(
        "ALTER INDEX ix_recon_match_reservation RENAME TO ix_recon_match_booking_statement"
    )

    # 5. Update the unique constraint on reconciliation_matches that referenced reservation_id.
    #    Drop + recreate (no-data-loss — composite unique).
    op.drop_constraint("uq_recon_match", "reconciliation_matches", type_="unique")
    op.create_unique_constraint(
        "uq_recon_match",
        "reconciliation_matches",
        ["reconciliation_source_id", "booking_statement_id"],
    )

    # 6. Update the tax_form_field_sources CHECK constraint allowlist:
    #    swap 'reservation' -> 'booking_statement'. The literal was never
    #    written by application code so no data migration is needed.
    op.drop_constraint("chk_tffs_source", "tax_form_field_sources", type_="check")
    op.create_check_constraint(
        "chk_tffs_source",
        "tax_form_field_sources",
        "source_type IN ("
        "'transaction', 'booking_statement', 'reconciliation_source', "
        "'tax_form_instance', 'manual'"
        ")",
    )


def downgrade() -> None:
    # Reverse order of upgrade.
    op.drop_constraint("chk_tffs_source", "tax_form_field_sources", type_="check")
    op.create_check_constraint(
        "chk_tffs_source",
        "tax_form_field_sources",
        "source_type IN ("
        "'transaction', 'reservation', 'reconciliation_source', "
        "'tax_form_instance', 'manual'"
        ")",
    )

    op.drop_constraint("uq_recon_match", "reconciliation_matches", type_="unique")
    op.create_unique_constraint(
        "uq_recon_match",
        "reconciliation_matches",
        ["reconciliation_source_id", "reservation_id"],
    )

    op.execute(
        "ALTER INDEX ix_recon_match_booking_statement RENAME TO ix_recon_match_reservation"
    )
    op.alter_column(
        "reconciliation_matches",
        "booking_statement_id",
        new_column_name="reservation_id",
    )

    op.execute(
        "ALTER TABLE booking_statements RENAME CONSTRAINT uq_bs_org_code TO uq_res_org_code"
    )
    op.execute(
        "ALTER TABLE booking_statements RENAME CONSTRAINT chk_bs_gross_when_platform TO chk_res_gross_when_platform"
    )
    op.execute(
        "ALTER TABLE booking_statements RENAME CONSTRAINT chk_bs_platform TO chk_res_platform"
    )
    op.execute(
        "ALTER TABLE booking_statements RENAME CONSTRAINT chk_bs_dates TO chk_res_dates"
    )
    op.execute(
        "ALTER TABLE booking_statements RENAME CONSTRAINT booking_statements_pkey TO reservations_pkey"
    )

    op.execute("ALTER INDEX ix_bs_transaction RENAME TO ix_res_transaction")
    op.execute("ALTER INDEX ix_bs_platform RENAME TO ix_res_platform")
    op.execute("ALTER INDEX ix_bs_org_checkin RENAME TO ix_res_org_checkin")
    op.execute("ALTER INDEX ix_bs_property_dates RENAME TO ix_res_property_dates")

    op.rename_table("booking_statements", "reservations")
