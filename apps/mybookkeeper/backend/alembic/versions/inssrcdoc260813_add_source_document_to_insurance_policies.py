"""add source_document_id to insurance_policies

A policy can now be read off a declarations page instead of typed in, so the
row records which document its numbers came from. Without it the reading is
unattributable: a coverage limit that turns out to be wrong gives no way back
to the page it was read from, and the operator cannot tell a figure they typed
from one a model proposed.

``ON DELETE SET NULL`` rather than CASCADE — deleting the evidence does not
make the coverage untrue, it makes it unsourced. Null is also the correct state
for every row that predates this column, and for any policy entered by hand.

Deliberately not the same thing as ``insurance_policy_attachments``: those are
paperwork the operator chose to keep against the policy, and there can be many.
This is provenance for the values in the row, and there is one.

Mirrors ``utility_plans.source_document_id``, which exists for the same reason.

Revision ID: inssrcdoc260813
Revises: insbench260813
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "inssrcdoc260813"
down_revision = "insbench260813"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "insurance_policies",
        sa.Column("source_document_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_insurance_policies_source_document_id",
        "insurance_policies",
        "documents",
        ["source_document_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_insurance_policies_source_document_id",
        "insurance_policies",
        ["source_document_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_insurance_policies_source_document_id",
        table_name="insurance_policies",
    )
    op.drop_constraint(
        "fk_insurance_policies_source_document_id",
        "insurance_policies",
        type_="foreignkey",
    )
    op.drop_column("insurance_policies", "source_document_id")
