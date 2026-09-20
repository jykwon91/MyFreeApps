"""backfill transaction.property_id for tenant payments that have none

Auto-attribution stamps ``transactions.property_id`` by walking
applicant -> signed_lease -> listing -> property. A signed lease may carry no
``listing_id`` (it is optional on both creation paths), which ended the walk
and saved the payment with ``property_id = NULL``. Those payments land in the
dashboard's "Unassigned" bucket instead of the property the tenant rents, so
a per-property revenue filter silently omits them.

The code path now falls back to the listing the tenant's inquiry came in
through. This migration applies the same fallback to rows written before that
fix.

Only rows that are already attributed to an applicant are touched, and only
when their property is still resolvable — nothing is guessed. Idempotent:
re-running matches no rows once ``property_id`` is set.

Not reversible: the pre-migration NULL carries no information worth
restoring, and nulling these columns again would re-break the dashboard.

Revision ID: txnprop260919
Revises: rentledg260830
Create Date: 2026-09-19
"""
from alembic import op


revision = "txnprop260919"
down_revision = "rentledg260830"
branch_labels = None
depends_on = None


# applicant -> listing, preferring a signed lease's listing and falling back
# to the listing the applicant's inquiry came in through. Mirrors
# ``app/services/leases/listing_resolution.py``.
_RESOLVED_LISTING_SQL = """
    SELECT COALESCE(
        (
            SELECT sl.listing_id
            FROM signed_leases sl
            WHERE sl.applicant_id = t.applicant_id
              AND sl.organization_id = t.organization_id
              AND sl.deleted_at IS NULL
              AND sl.listing_id IS NOT NULL
            ORDER BY sl.created_at DESC
            LIMIT 1
        ),
        (
            SELECT i.listing_id
            FROM applicants a
            JOIN inquiries i ON i.id = a.inquiry_id
            WHERE a.id = t.applicant_id
              AND a.organization_id = t.organization_id
              AND i.organization_id = t.organization_id
            LIMIT 1
        )
    )
"""


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE transactions AS t
        SET property_id = l.property_id
        FROM listings AS l
        WHERE t.property_id IS NULL
          AND t.applicant_id IS NOT NULL
          AND l.organization_id = t.organization_id
          AND l.property_id IS NOT NULL
          AND l.id = ({_RESOLVED_LISTING_SQL})
        """
    )


def downgrade() -> None:
    # Intentionally a no-op: restoring NULL would reintroduce the bug this
    # migration exists to repair, and the NULL held no information.
    pass
