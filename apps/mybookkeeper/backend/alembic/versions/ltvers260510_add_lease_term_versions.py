"""Add lease_term_versions table + signed_leases.parent_lease_id + ends_on partial index.

Foundation schema for the lease extension / successor lease feature
(see project memory: ``project_lease_extension_feature_design.md``).

This migration is schema-only. It does NOT touch ``applicants.contract_end``;
that refactor lands in a follow-up PR.

Backfill: every existing ``signed_leases`` row with non-null ``starts_on`` AND
``ends_on`` gets a seed ``lease_term_versions`` row capturing the original
term. Leases that never had dates filled in (drafts) are skipped — the
extension flow only runs from ``signed`` / ``active`` status anyway, so the
seed will be created at signature time for those once the feature ships.

Revision ID: ltvers260510
Revises: gskmsg260508
Create Date: 2026-05-10 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision: str = "ltvers260510"
down_revision: Union[str, None] = "gskmsg260508"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lease_term_versions",
        sa.Column(
            "id",
            PGUUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "lease_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("signed_leases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column(
            "source_attachment_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("signed_lease_attachments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        "uq_lease_term_versions_lease_attachment",
        "lease_term_versions",
        ["lease_id", "source_attachment_id"],
        unique=True,
        postgresql_where=sa.text("source_attachment_id IS NOT NULL"),
    )
    op.create_index(
        "uq_lease_term_versions_seed_per_lease",
        "lease_term_versions",
        ["lease_id"],
        unique=True,
        postgresql_where=sa.text(
            "source_attachment_id IS NULL AND deleted_at IS NULL"
        ),
    )
    op.create_index(
        "ix_lease_term_versions_lease_active",
        "lease_term_versions",
        ["lease_id", "created_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # Successor-lease pointer on signed_leases.
    op.add_column(
        "signed_leases",
        sa.Column(
            "parent_lease_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("signed_leases.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_signed_leases_parent_lease_id",
        "signed_leases",
        ["parent_lease_id"],
    )

    # Drives "expiring lease" queries.
    op.create_index(
        "ix_signed_leases_org_ends_on_active",
        "signed_leases",
        ["organization_id", "ends_on"],
        postgresql_where=sa.text(
            "deleted_at IS NULL AND ends_on IS NOT NULL"
        ),
    )

    # Backfill: seed one lease_term_versions row per signed lease with both
    # dates populated. user_id from the lease's owner (FK RESTRICT means
    # the user always exists for a non-deleted lease).
    op.execute(
        """
        INSERT INTO lease_term_versions (
            id, lease_id, starts_on, ends_on,
            source_attachment_id, created_by_user_id, created_at, deleted_at
        )
        SELECT
            gen_random_uuid(),
            sl.id,
            sl.starts_on,
            sl.ends_on,
            NULL,
            sl.user_id,
            COALESCE(sl.signed_at, sl.created_at),
            NULL
        FROM signed_leases sl
        WHERE sl.starts_on IS NOT NULL
          AND sl.ends_on IS NOT NULL
          AND sl.deleted_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_signed_leases_org_ends_on_active",
        table_name="signed_leases",
    )
    op.drop_index(
        "ix_signed_leases_parent_lease_id",
        table_name="signed_leases",
    )
    op.drop_column("signed_leases", "parent_lease_id")

    op.drop_index(
        "ix_lease_term_versions_lease_active",
        table_name="lease_term_versions",
    )
    op.drop_index(
        "uq_lease_term_versions_seed_per_lease",
        table_name="lease_term_versions",
    )
    op.drop_index(
        "uq_lease_term_versions_lease_attachment",
        table_name="lease_term_versions",
    )
    op.drop_table("lease_term_versions")
