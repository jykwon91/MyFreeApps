"""Multi-template lease support: replace signed_leases.template_id with M:N join table.

A signed lease can now be generated from MULTIPLE templates in one batch.
Each contributing template is recorded in ``signed_lease_templates`` with a
``display_order`` so the host's pick order is preserved when rendering /
generating documents.

Migration sequence (data-safe):
1. Create ``signed_lease_templates`` (lease_id, template_id, display_order,
   created_at) with PK on (lease_id, template_id) and an index on template_id.
2. Backfill: copy every non-null ``signed_leases.template_id`` into the join
   table with ``display_order=0``.
3. Drop column ``signed_leases.template_id``.

The ``ON DELETE CASCADE`` on lease_id mirrors signed_lease_attachments —
hard-deleting a lease wipes its template links. ``ON DELETE RESTRICT`` on
template_id preserves links when a template is soft-deleted; the
application layer enforces "soft-delete blocked when active leases
reference this template" with a 409 response (now via the join table).

Downgrade is best-effort: it restores ``signed_leases.template_id`` and
copies the lowest-display_order template_id back. Multi-template leases
will lose the secondary template links on downgrade — this is documented
in the PR's operational-migration section.

Revision ID: leasemulti260507
Revises: mrgheads260507
Create Date: 2026-05-07 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "leasemulti260507"
down_revision: Union[str, None] = "mrgheads260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create the M:N join table.
    op.create_table(
        "signed_lease_templates",
        sa.Column(
            "lease_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("signed_leases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lease_templates.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "display_order",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint(
            "lease_id", "template_id", name="pk_signed_lease_templates",
        ),
    )
    op.create_index(
        "ix_signed_lease_templates_template_id",
        "signed_lease_templates",
        ["template_id"],
    )

    # 2. Backfill from existing signed_leases.template_id values.
    #    Only rows where template_id IS NOT NULL contribute (imported leases
    #    keep zero template links by definition).
    op.execute(
        """
        INSERT INTO signed_lease_templates (lease_id, template_id, display_order, created_at)
        SELECT id, template_id, 0, COALESCE(created_at, now())
        FROM signed_leases
        WHERE template_id IS NOT NULL
        """
    )

    # 3. Drop the now-redundant column from signed_leases.
    op.drop_column("signed_leases", "template_id")


def downgrade() -> None:
    # Re-add the column (nullable — imported leases never had a value).
    op.add_column(
        "signed_leases",
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lease_templates.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )

    # Restore the lowest-display_order template per lease (best-effort —
    # multi-template leases lose their secondary links).
    op.execute(
        """
        UPDATE signed_leases sl
        SET template_id = sub.template_id
        FROM (
            SELECT DISTINCT ON (lease_id) lease_id, template_id
            FROM signed_lease_templates
            ORDER BY lease_id, display_order ASC, created_at ASC
        ) sub
        WHERE sl.id = sub.lease_id
        """
    )

    # Drop the join table.
    op.drop_index(
        "ix_signed_lease_templates_template_id",
        table_name="signed_lease_templates",
    )
    op.drop_table("signed_lease_templates")
