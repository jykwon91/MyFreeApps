"""add listings domain (listings, listing_photos, listing_external_ids)

Revision ID: c5e7f9a1b3d5
Revises: b3c4d5e6f7a8
Create Date: 2026-04-26

Phase 1 / PR 1.1a of the rentals expansion. See RENTALS_PLAN.md §5.1.

Conventions per RENTALS_PLAN.md §4.1:
- String + CheckConstraint for stage/category columns (not SAEnum)
- Dual scope: organization_id + user_id
- Soft-delete via deleted_at
- Numeric(12, 2) for money columns
- DateTime(timezone=True) with server_default = func.now()
- UUID primary keys
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c5e7f9a1b3d5"
down_revision: Union[str, None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "listings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("monthly_rate", sa.Numeric(12, 2), nullable=False),
        sa.Column("weekly_rate", sa.Numeric(12, 2), nullable=True),
        sa.Column("nightly_rate", sa.Numeric(12, 2), nullable=True),
        sa.Column("min_stay_days", sa.SmallInteger(), nullable=True),
        sa.Column("max_stay_days", sa.SmallInteger(), nullable=True),
        sa.Column("room_type", sa.String(length=20), nullable=False),
        sa.Column("private_bath", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("parking_assigned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("furnished", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("amenities", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("pets_on_premises", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("large_dog_disclosure", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "room_type IN ('private_room', 'whole_unit', 'shared')",
            name="chk_listing_room_type",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'paused', 'draft', 'archived')",
            name="chk_listing_status",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(amenities) = 'array'",
            name="chk_listing_amenities_is_array",
        ),
    )
    op.create_index("ix_listings_organization_id", "listings", ["organization_id"])
    op.create_index("ix_listings_user_id", "listings", ["user_id"])
    op.create_index("ix_listings_property_id", "listings", ["property_id"])
    op.create_index(
        "ix_listings_org_status_active",
        "listings",
        ["organization_id", "status"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_listings_org_property",
        "listings",
        ["organization_id", "property_id"],
    )

    op.create_table(
        "listing_photos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("listing_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("caption", sa.String(length=500), nullable=True),
        sa.Column("display_order", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["listing_id"], ["listings.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_listing_photos_listing_id", "listing_photos", ["listing_id"])
    op.create_index(
        "ix_listing_photos_listing_order",
        "listing_photos",
        ["listing_id", "display_order"],
    )

    op.create_table(
        "listing_external_ids",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("listing_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=True),
        sa.Column("external_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["listing_id"], ["listings.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "source IN ('FF', 'TNH', 'Airbnb', 'direct')",
            name="chk_listing_external_id_source",
        ),
        sa.UniqueConstraint("listing_id", "source", name="uq_listing_external_id_listing_source"),
    )
    op.create_index("ix_listing_external_ids_listing_id", "listing_external_ids", ["listing_id"])
    # Partial unique: prevents two listings claiming the same FF-123 external_id
    # (only enforced where external_id IS NOT NULL — manual entries can leave it blank).
    op.create_index(
        "uq_listing_external_id_source_external",
        "listing_external_ids",
        ["source", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_listing_external_id_source_external", table_name="listing_external_ids")
    op.drop_index("ix_listing_external_ids_listing_id", table_name="listing_external_ids")
    op.drop_table("listing_external_ids")

    op.drop_index("ix_listing_photos_listing_order", table_name="listing_photos")
    op.drop_index("ix_listing_photos_listing_id", table_name="listing_photos")
    op.drop_table("listing_photos")

    op.drop_index("ix_listings_org_property", table_name="listings")
    op.drop_index("ix_listings_org_status_active", table_name="listings")
    op.drop_index("ix_listings_property_id", table_name="listings")
    op.drop_index("ix_listings_user_id", table_name="listings")
    op.drop_index("ix_listings_organization_id", table_name="listings")
    op.drop_table("listings")
