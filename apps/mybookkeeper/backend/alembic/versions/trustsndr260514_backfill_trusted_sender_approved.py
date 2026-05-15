"""backfill trusted-sender transactions from unverified to approved

Email-body extractions from trusted payment senders (Airbnb, Zelle, VRBO,
Booking.com, Vello, FurnishedFinder) are now auto-approved at extraction
time. Existing rows created before that change still carry status
``unverified``; this migration backfills them so the dashboard reflects
the same totals new extractions would.

Sender email is not stored on any persistent row, so the join uses the
extraction/document link plus a vendor ILIKE on the Claude-extracted
vendor name (which matches the platform brand in practice).

Idempotent: re-running is a no-op once status flips to ``approved``.
Reversible (best-effort): downgrade flips the same matching rows back to
``unverified``. If a row was already ``approved`` before this migration
ran, downgrade will incorrectly flip it — operator should rely on
backups for an exact rollback.

Revision ID: trustsndr260514
Revises: rmplaid260511
Create Date: 2026-05-14
"""
from alembic import op


revision = "trustsndr260514"
down_revision = "rmplaid260511"
branch_labels = None
depends_on = None


_TRUSTED_VENDOR_PATTERNS = (
    "%airbnb%",
    "%zelle%",
    "%vrbo%",
    "%booking.com%",
    "%vello%",
    "%furnishedfinder%",
)


def _vendor_ilike_clause(alias: str) -> str:
    parts = [f"{alias}.vendor ILIKE '{p}'" for p in _TRUSTED_VENDOR_PATTERNS]
    return "(" + " OR ".join(parts) + ")"


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE transactions AS t
        SET status = 'approved'
        WHERE t.status = 'unverified'
          AND t.extraction_id IS NOT NULL
          AND EXISTS (
              SELECT 1
              FROM extractions e
              JOIN documents d ON d.id = e.document_id
              WHERE e.id = t.extraction_id
                AND d.source = 'email'
          )
          AND {_vendor_ilike_clause("t")}
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        UPDATE transactions AS t
        SET status = 'unverified'
        WHERE t.status = 'approved'
          AND t.extraction_id IS NOT NULL
          AND EXISTS (
              SELECT 1
              FROM extractions e
              JOIN documents d ON d.id = e.document_id
              WHERE e.id = t.extraction_id
                AND d.source = 'email'
          )
          AND {_vendor_ilike_clause("t")}
        """
    )
