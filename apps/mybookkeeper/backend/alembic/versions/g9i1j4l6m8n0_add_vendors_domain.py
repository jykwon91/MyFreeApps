"""add vendors domain (vendors table)

Revision ID: g9i1j4l6m8n0
Revises: f8h0i3k5l7m9
Create Date: 2026-04-28

Phase 4 / PR 4.1a of the rentals expansion. See RENTALS_PLAN.md §5.4.

Conventions per RENTALS_PLAN.md §4.1 (mirrors the applicants migration in
``f8h0i3k5l7m9_add_applicants_domain.py``):

- String + CheckConstraint for ``category`` (not SAEnum, not a lookup table —
  the value set is small and stable).
- Dual scope: ``organization_id + user_id`` on the parent (``vendors``);
  both ``ON DELETE CASCADE``.
- Soft-delete via ``deleted_at`` so historical ``Transaction.vendor_id``
  references (added in PR 4.2's combined-FK migration) can still resolve a
  vendor name after the host removes the vendor from the active rolodex.
- ``DateTime(timezone=True)`` with ``server_default=func.now()``.
- UUID primary key (``uuid.uuid4`` Python-side default).
- Vendors carry no host PII (they are businesses) — no ``EncryptedString``
  columns and no ``key_version`` column.
- ``Numeric(12, 2)`` for ``hourly_rate`` per project money convention.

NOT in scope for this PR (per the task brief):
- ``Transaction.vendor_id`` FK column (PR 4.2 combined-FK migration).
- A separate ``vendor_categories`` lookup table — categories are a
  CheckConstraint, locked in here.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "g9i1j4l6m8n0"
down_revision: Union[str, None] = "f8h0i3k5l7m9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vendors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("hourly_rate", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("flat_rate_notes", sa.Text(), nullable=True),
        sa.Column(
            "preferred",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE",
            name="fk_vendors_organization_id",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE",
            name="fk_vendors_user_id",
        ),
        sa.CheckConstraint(
            "category IN ('handyman', 'plumber', 'electrician', 'hvac', "
            "'locksmith', 'cleaner', 'pest', 'landscaper', "
            "'general_contractor')",
            name="chk_vendor_category",
        ),
    )
    op.create_index("ix_vendors_organization_id", "vendors", ["organization_id"])
    op.create_index("ix_vendors_user_id", "vendors", ["user_id"])
    op.create_index(
        "ix_vendors_org_category_active",
        "vendors",
        ["organization_id", "category"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_vendors_org_preferred_active",
        "vendors",
        ["organization_id", "preferred"],
        postgresql_where=sa.text("deleted_at IS NULL AND preferred = true"),
    )
    op.create_index(
        "ix_vendors_org_created_active",
        "vendors",
        ["organization_id", "created_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_vendors_org_created_active", table_name="vendors")
    op.drop_index("ix_vendors_org_preferred_active", table_name="vendors")
    op.drop_index("ix_vendors_org_category_active", table_name="vendors")
    op.drop_index("ix_vendors_user_id", table_name="vendors")
    op.drop_index("ix_vendors_organization_id", table_name="vendors")
    op.drop_table("vendors")
