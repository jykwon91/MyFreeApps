"""add utility_account_link — learned utility account -> property

Revision ID: utillink260624
Revises: attrverify260602
Create Date: 2026-06-24

Ties utility "bill is ready / due" notification emails (AT&T, City of Houston
Water, CenterPoint, etc.) to a property via a learned map keyed on
``(sender_domain, account_number)`` — these notifications carry an account
number + amount but NO service address, so the address matcher can't resolve
them. The link is learned the first time the bill IS resolvable (explicit pick
or an address-matched bill that also exposes the account number).

Conventions (mirrors payer_alias):
- ``source`` is String(20) + CheckConstraint (never SQLAlchemy Enum).
- Tenant isolation via ``organization_id`` (+ ``user_id``), both ON DELETE
  CASCADE; ``property_id`` CASCADE so a deleted property's links go with it.
- UUID PK (python ``uuid.uuid4`` default — no server_default on the PK);
  created_at/updated_at carry a server default per the timestamp convention.
- ``account_number`` is PLAINTEXT String(100) — equality lookup needs a
  deterministic value, which rules out EncryptedString.
- Unique on (organization_id, sender_domain, account_number).
- Explicit indexes on property_id + user_id (Postgres does not auto-index FKs;
  needed for CASCADE delete and reverse list-by-property lookups). The unique
  constraint's leftmost (organization_id) column serves org-scoped scans.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "utillink260624"
down_revision: Union[str, None] = "attrverify260602"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "utility_account_link",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sender_domain", sa.String(length=255), nullable=False),
        sa.Column("account_number", sa.String(length=100), nullable=False),
        sa.Column("provider_label", sa.String(length=100), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "organization_id", "sender_domain", "account_number",
            name="uq_utility_account_link",
        ),
        sa.CheckConstraint(
            "source IN ('auto_learn', 'manual_link')",
            name="chk_utility_account_link_source",
        ),
    )
    op.create_index(
        "ix_utility_account_link_organization_id",
        "utility_account_link",
        ["organization_id"],
    )
    op.create_index(
        "ix_utility_link_property_id", "utility_account_link", ["property_id"]
    )
    op.create_index(
        "ix_utility_link_user_id", "utility_account_link", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_utility_link_user_id", table_name="utility_account_link")
    op.drop_index("ix_utility_link_property_id", table_name="utility_account_link")
    op.drop_index(
        "ix_utility_account_link_organization_id",
        table_name="utility_account_link",
    )
    op.drop_table("utility_account_link")
