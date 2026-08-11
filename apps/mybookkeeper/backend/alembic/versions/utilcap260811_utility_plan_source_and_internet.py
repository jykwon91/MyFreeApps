"""add source document + internet shape to utility_plans

Two unrelated-looking additions that share one motive: making a recorded plan
answer questions it currently cannot.

``source_document_id`` points a plan at the document its numbers came from. A
rate with no provenance has to be re-derived from scratch every time it is
doubted — which happened on 2026-08-11, when an EFL read 16.5 c/kWh and the
provider portal read 15.66 c/kWh for the same plan. (The gap was a TDU rate
change between the EFL's issue date and now, knowable in seconds if the row had
pointed at its source.)

The internet columns give a service type that was already legal in the CHECK
constraint an actual shape. Every price column on this table is named for
kilowatt-hours; an internet plan priced them all NULL and recorded nothing about
what it costs after the promo ends, what the equipment rental adds, or how much
bandwidth the money buys.

Revision ID: utilcap260811
Revises: rcptclamp260809
Create Date: 2026-08-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "utilcap260811"
down_revision = "rcptclamp260809"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SET NULL, not CASCADE: deleting the source document must not delete the
    # plan. The rate stays true after its evidence is gone — it just becomes
    # unsourced, which is exactly the state every existing row is already in.
    op.add_column(
        "utility_plans",
        sa.Column("source_document_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_utility_plans_source_document_id",
        "utility_plans",
        "documents",
        ["source_document_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # PostgreSQL does not auto-index FKs, and this one carries the SET NULL
    # sweep on document delete.
    op.create_index(
        "ix_utility_plans_source_document_id",
        "utility_plans",
        ["source_document_id"],
    )

    # ---- Internet shape ---------------------------------------------------
    # The promo trap. term_end_date already says when the introductory period
    # ends; without the price on the other side of that date, a renewal alert
    # can say "this ends soon" but not "and the bill goes from $50 to $95",
    # which is the only part that prompts action.
    op.add_column(
        "utility_plans",
        sa.Column("post_promo_monthly_cents", sa.BigInteger(), nullable=True),
    )
    # Modem / router rental, routinely excluded from the advertised price. Same
    # class of unshoppable pass-through as tdu_charge_cents_per_kwh, and
    # separated for the same reason.
    op.add_column(
        "utility_plans",
        sa.Column("equipment_fee_monthly_cents", sa.BigInteger(), nullable=True),
    )
    # Internet's kWh. $50 for 100 Mbps and $50 for 1 Gbps are not the same
    # purchase, and this table's premise is that a dollar amount without its
    # quantity is incomparable.
    op.add_column("utility_plans", sa.Column("download_mbps", sa.Integer(), nullable=True))
    op.add_column("utility_plans", sa.Column("upload_mbps", sa.Integer(), nullable=True))
    # NULL means uncapped, which is the common case on fiber. Cable commonly
    # caps around 1.2 TB. Overage pricing is rare enough to live in notes.
    op.add_column("utility_plans", sa.Column("data_cap_gb", sa.Integer(), nullable=True))

    op.create_check_constraint(
        "chk_utility_plan_post_promo_needs_term_end",
        "utility_plans",
        "post_promo_monthly_cents IS NULL OR term_end_date IS NOT NULL",
    )
    op.create_check_constraint(
        "chk_utility_plan_internet_amounts_nonneg",
        "utility_plans",
        "(post_promo_monthly_cents IS NULL OR post_promo_monthly_cents >= 0)"
        " AND (equipment_fee_monthly_cents IS NULL"
        " OR equipment_fee_monthly_cents >= 0)",
    )
    # Zero is not a meaningful speed or cap — it means "not recorded", which is
    # what NULL is for. Rejecting 0 keeps the two from being confused.
    op.create_check_constraint(
        "chk_utility_plan_speeds_positive",
        "utility_plans",
        "(download_mbps IS NULL OR download_mbps > 0)"
        " AND (upload_mbps IS NULL OR upload_mbps > 0)"
        " AND (data_cap_gb IS NULL OR data_cap_gb > 0)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "chk_utility_plan_speeds_positive", "utility_plans", type_="check",
    )
    op.drop_constraint(
        "chk_utility_plan_internet_amounts_nonneg", "utility_plans", type_="check",
    )
    op.drop_constraint(
        "chk_utility_plan_post_promo_needs_term_end", "utility_plans", type_="check",
    )
    op.drop_column("utility_plans", "data_cap_gb")
    op.drop_column("utility_plans", "upload_mbps")
    op.drop_column("utility_plans", "download_mbps")
    op.drop_column("utility_plans", "equipment_fee_monthly_cents")
    op.drop_column("utility_plans", "post_promo_monthly_cents")

    op.drop_index("ix_utility_plans_source_document_id", table_name="utility_plans")
    op.drop_constraint(
        "fk_utility_plans_source_document_id", "utility_plans", type_="foreignkey",
    )
    op.drop_column("utility_plans", "source_document_id")
