"""Every lease records its house: add ``signed_leases.property_id``.

Rent attribution used to reach a tenant's property only through a listing
(the lease's, else the applicant's inquiry's). A lease with neither — or a
house with no listing at all — left the tenant's rent filed under no property.
The lease now carries the property directly.

Nullable, FK to ``properties`` with ``ON DELETE SET NULL`` (deleting a house
must not delete the legal lease record), indexed.

Backfill, idempotent (only rows still NULL are touched, and only from a
property of the lease's own organization):
  1. from the lease's listing → listing.property_id;
  2. else from the applicant's inquiry listing → listing.property_id.

Downgrade drops the column (and its index and FK).

Revision ID: leaseprop261125
Revises: holdings261124
Create Date: 2026-11-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "leaseprop261125"
down_revision = "holdings261124"
branch_labels = None
depends_on = None

_INDEX = "ix_signed_leases_property_id"
_FK = "fk_signed_leases_property_id_properties"

_BACKFILL_FROM_LEASE_LISTING = """
UPDATE signed_leases AS sl
SET property_id = p.id
FROM listings AS l
JOIN properties AS p ON p.id = l.property_id
WHERE sl.property_id IS NULL
  AND sl.listing_id = l.id
  AND l.organization_id = sl.organization_id
  AND p.organization_id = sl.organization_id
"""

_BACKFILL_FROM_INQUIRY_LISTING = """
UPDATE signed_leases AS sl
SET property_id = p.id
FROM applicants AS a
JOIN inquiries AS i ON i.id = a.inquiry_id
JOIN listings AS l ON l.id = i.listing_id
JOIN properties AS p ON p.id = l.property_id
WHERE sl.property_id IS NULL
  AND a.id = sl.applicant_id
  AND i.organization_id = sl.organization_id
  AND l.organization_id = sl.organization_id
  AND p.organization_id = sl.organization_id
"""


def upgrade() -> None:
    op.add_column(
        "signed_leases",
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        _FK, "signed_leases", "properties", ["property_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index(_INDEX, "signed_leases", ["property_id"])
    op.execute(_BACKFILL_FROM_LEASE_LISTING)
    op.execute(_BACKFILL_FROM_INQUIRY_LISTING)


def downgrade() -> None:
    op.drop_index(_INDEX, table_name="signed_leases")
    op.drop_constraint(_FK, "signed_leases", type_="foreignkey")
    op.drop_column("signed_leases", "property_id")
