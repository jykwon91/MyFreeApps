"""add screening_results.uploaded_at + uploaded_by_user_id (Phase 3 / PR 3.3)

Revision ID: i1k3l6n8p0q2
Revises: h0j2k5m7n9p1
Create Date: 2026-04-29

Phase 3 / PR 3.3 of the rentals expansion. See RENTALS_PLAN.md §5.3, §8.5.

PR 3.1a shipped the ``screening_results`` table with ``requested_at`` /
``completed_at`` (the lifecycle timestamps for an in-flight screening
request). This migration adds two columns the KeyCheck redirect-only flow
needs:

- ``uploaded_at timestamptz NOT NULL`` — when the host uploaded the report
  PDF. Distinct from ``completed_at`` (which is the provider-side completion
  signal we don't have in the redirect-only model) and ``created_at`` (which
  is the row-creation timestamp). Server-default ``now()`` so existing rows
  (created via PR 3.1a's seed-applicant test endpoint) backfill cleanly.
- ``uploaded_by_user_id uuid NOT NULL`` references ``users.id`` ON DELETE
  RESTRICT. Captures who uploaded the report for the audit trail. Existing
  rows (which have no uploader) are backfilled by inheriting the parent
  applicant's ``user_id`` — the only sensible default since the row was
  effectively recorded by that user.

Both columns are populated by the ``screening_service.record_result()``
service method on insert; the route handler injects ``uploaded_by_user_id``
from the request context, and ``uploaded_at`` is server-set via ``now()``.

Conventions followed (mirrors ``h0j2k5m7n9p1`` which added
``transactions.vendor_id`` with a precise FK + index naming scheme):

- FK constraint name: ``fk_screening_results_uploaded_by`` (matches the
  ``fk_screening_results_applicant_id`` style from the parent migration).
- Down-migration drops the FK constraint, then the columns — reverse of
  upgrade order.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "i1k3l6n8p0q2"
down_revision: Union[str, None] = "h0j2k5m7n9p1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add uploaded_at with server_default=now() so existing rows backfill
    # to "now" — they were effectively recorded at this point in time.
    op.add_column(
        "screening_results",
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Add uploaded_by_user_id as nullable first so we can backfill before
    # tightening to NOT NULL. The backfill copies the parent applicant's
    # user_id — the only sensible default for legacy rows.
    op.add_column(
        "screening_results",
        sa.Column(
            "uploaded_by_user_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )

    op.execute(
        """
        UPDATE screening_results sr
        SET uploaded_by_user_id = a.user_id
        FROM applicants a
        WHERE sr.applicant_id = a.id
          AND sr.uploaded_by_user_id IS NULL
        """
    )

    op.alter_column(
        "screening_results",
        "uploaded_by_user_id",
        nullable=False,
    )

    op.create_foreign_key(
        "fk_screening_results_uploaded_by",
        "screening_results",
        "users",
        ["uploaded_by_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_screening_results_uploaded_by",
        "screening_results",
        type_="foreignkey",
    )
    op.drop_column("screening_results", "uploaded_by_user_id")
    op.drop_column("screening_results", "uploaded_at")
