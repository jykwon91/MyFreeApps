"""Add host_notes to listing_blackouts + new listing_blackout_attachments table.

Per feature spec: operators can annotate any blackout (iCal-imported or
manual) with free-text notes and file attachments. The iCal poller UPSERT
must never overwrite host_notes — that constraint is enforced at the
repository layer, not here.

Revision ID: mbk260502
Revises: ffcorr260502
Create Date: 2026-05-02 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "mbk260502"
down_revision: Union[str, None] = "ffcorr260502"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- listing_blackouts: add host_notes column ---
    op.add_column(
        "listing_blackouts",
        sa.Column("host_notes", sa.Text(), nullable=True),
    )

    # --- new listing_blackout_attachments table ---
    op.create_table(
        "listing_blackout_attachments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "listing_blackout_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("listing_blackouts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "uploaded_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_index(
        "ix_listing_blackout_attachments_blackout_id",
        "listing_blackout_attachments",
        ["listing_blackout_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_listing_blackout_attachments_blackout_id",
        table_name="listing_blackout_attachments",
    )
    op.drop_table("listing_blackout_attachments")
    op.drop_column("listing_blackouts", "host_notes")
