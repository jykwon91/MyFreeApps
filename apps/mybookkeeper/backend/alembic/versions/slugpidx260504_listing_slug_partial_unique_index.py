"""listings.slug — replace full unique constraint with partial unique index (active rows only)

The full UNIQUE constraint on listings.slug burns archived slugs forever.
A host who archives a listing and creates a fresh one with the same slug
gets a constraint violation. The correct shape is: slug must be unique
among *active* (non-deleted) listings. Soft-deleted rows may share a slug
with a current one.

Revision ID: slugpidx260504
Revises: recpbf260504
Create Date: 2026-05-04
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "slugpidx260504"
down_revision: Union[str, None] = "recpbf260504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # Defensive check: abort if any duplicate slug exists among non-deleted rows.
    # This should never happen in a healthy database, but if it does the operator
    # must resolve it manually before this migration can run.
    duplicates = bind.execute(
        sa.text(
            """
            SELECT slug, COUNT(*) AS cnt
            FROM listings
            WHERE deleted_at IS NULL
              AND slug IS NOT NULL
            GROUP BY slug
            HAVING COUNT(*) > 1
            """
        )
    ).fetchall()
    if duplicates:
        conflict_list = ", ".join(f"'{row[0]}' ({row[1]} rows)" for row in duplicates)
        raise RuntimeError(
            f"Migration aborted: duplicate slugs found among active listings — "
            f"{conflict_list}. Resolve conflicts manually before re-running."
        )

    # Drop the full unique constraint.
    op.drop_constraint("uq_listings_slug", "listings", type_="unique")

    # Create a partial unique index: slug uniqueness is only enforced for
    # rows where deleted_at IS NULL (i.e. active listings).
    if is_postgres:
        op.create_index(
            "uq_listings_slug_active",
            "listings",
            ["slug"],
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL"),
        )
    else:
        # SQLite (tests): fall back to a full unique index — SQLite supports
        # partial indexes via WHERE but only in recent versions, and the test
        # suite uses an in-memory SQLite DB that may not support it.  The
        # behavioral tests against the partial-index semantics run against
        # PostgreSQL only (marked with @pytest.mark.postgres).
        op.create_index(
            "uq_listings_slug_active",
            "listings",
            ["slug"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index("uq_listings_slug_active", table_name="listings")

    # Re-create the original full unique constraint.
    # Note: if archived listings now share a slug with an active one, this
    # downgrade will fail — the operator must rename the duplicates first.
    op.create_unique_constraint("uq_listings_slug", "listings", ["slug"])
