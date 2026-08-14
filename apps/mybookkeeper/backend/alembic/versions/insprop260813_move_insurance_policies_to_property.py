"""move insurance_policies from listing_id to property_id

A dwelling policy insures the building. Hanging it off a listing was wrong:
a house let room by room has one policy and many listings, so the old shape
forced one duplicate policy row per room, each with its own expiration date to
renew and its own premium to keep in step. Every other building-scoped record
in this app — leases, tenants, activity periods, utility account links — is
already keyed on ``property_id``; insurance was the lone exception.

The backfill reads the property through the listing each policy currently
points at, so no policy loses its subject. Rows are never dropped: if a policy
somehow references a listing that no longer exists, the NOT NULL alter fails
loudly rather than quietly deleting a financial record.

Downgrade is lossy by nature — the old shape cannot express "the building"
without picking one of its listings, so it picks the earliest-created one. A
property with no listings at all has no valid representation in the old shape
and the downgrade fails there instead of inventing a listing.

Revision ID: insprop260813
Revises: inssrcdoc260813
Create Date: 2026-08-13
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision = "insprop260813"
down_revision = "inssrcdoc260813"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "insurance_policies",
        sa.Column("property_id", PGUUID(as_uuid=True), nullable=True),
    )

    op.execute(
        """
        UPDATE insurance_policies AS p
           SET property_id = l.property_id
        FROM listings AS l
        WHERE l.id = p.listing_id
        """
    )

    op.alter_column("insurance_policies", "property_id", nullable=False)

    op.create_foreign_key(
        "fk_insurance_policies_property_id",
        "insurance_policies",
        "properties",
        ["property_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_insurance_policies_property_id",
        "insurance_policies",
        ["property_id"],
    )

    op.drop_index("ix_insurance_policies_listing_id", table_name="insurance_policies")
    # Drops the inline listings FK along with the column.
    op.drop_column("insurance_policies", "listing_id")


def downgrade() -> None:
    op.add_column(
        "insurance_policies",
        sa.Column("listing_id", PGUUID(as_uuid=True), nullable=True),
    )

    # Lossy: one policy covers every listing on the property, and the old shape
    # holds only one. Earliest-created listing wins so the choice is at least
    # deterministic.
    op.execute(
        """
        UPDATE insurance_policies AS p
           SET listing_id = (
               SELECT l.id
                 FROM listings AS l
                WHERE l.property_id = p.property_id
                ORDER BY l.created_at ASC, l.id ASC
                LIMIT 1
           )
        """
    )

    op.alter_column("insurance_policies", "listing_id", nullable=False)

    op.create_foreign_key(
        "fk_insurance_policies_listing_id",
        "insurance_policies",
        "listings",
        ["listing_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_insurance_policies_listing_id",
        "insurance_policies",
        ["listing_id"],
    )

    op.drop_index("ix_insurance_policies_property_id", table_name="insurance_policies")
    op.drop_constraint(
        "fk_insurance_policies_property_id",
        "insurance_policies",
        type_="foreignkey",
    )
    op.drop_column("insurance_policies", "property_id")
