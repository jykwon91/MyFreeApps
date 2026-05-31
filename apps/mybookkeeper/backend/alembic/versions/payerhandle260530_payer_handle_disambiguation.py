"""payer_alias same-name disambiguation + transactions.payer_handle

Revision ID: payerhandle260530
Revises: payeralias260530
Create Date: 2026-05-30

Payment Review PR3 — disambiguate two different people who share a payer name
via a stable sender handle (Zelle email/phone, Venmo @user, Cash App $tag). Two
schema changes:

1. ``transactions.payer_handle`` — new nullable column. The handle captured at
   extraction when the payment notification exposed one (NULL otherwise — most
   Zelle bank alerts show only a name). Informational on the txn; read by
   confirm / manual-link to seed the learned alias's handle.

2. ``payer_alias`` — replace the ``(organization_id, normalized_payer_name)``
   unique constraint with ``(organization_id, normalized_payer_name,
   payer_handle, applicant_id)``. This lets a name map to more than one tenant:
   different people who share a name (disambiguated by handle) each get a row,
   and a name confirmed to two distinct tenants WITHOUT a distinguishing handle
   leaves two rows — which the matcher reads as ambiguous and routes to review
   (never a silent wrong-attribution). ``payer_handle`` is backfilled NULL → ''
   and made NOT NULL so it participates in the unique key with identical
   semantics on SQLite (tests) and PostgreSQL (prod) — NULL uniqueness differs
   between the two engines.

Additive / backward-compatible: the existing deploy's ``alembic upgrade head``
applies it; the constraint swap only loosens uniqueness, so no conflict is
possible against existing rows. No env or operator action required.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "payerhandle260530"
down_revision: Union[str, None] = "payeralias260530"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. transactions.payer_handle — informational, nullable.
    op.add_column(
        "transactions",
        sa.Column("payer_handle", sa.String(length=255), nullable=True),
    )

    # 2. payer_alias — empty-string sentinel + widened unique key.
    op.execute("UPDATE payer_alias SET payer_handle = '' WHERE payer_handle IS NULL")
    op.alter_column(
        "payer_alias",
        "payer_handle",
        existing_type=sa.String(length=255),
        nullable=False,
        server_default="",
    )
    op.drop_constraint("uq_payer_alias_org_name", "payer_alias", type_="unique")
    op.create_unique_constraint(
        "uq_payer_alias_org_name_handle_applicant",
        "payer_alias",
        ["organization_id", "normalized_payer_name", "payer_handle", "applicant_id"],
    )


def downgrade() -> None:
    # Re-narrowing the unique key to (org, name) would fail if PR3's multi-row
    # behavior was exercised (a name aliased to two tenants). Collapse any such
    # duplicates to the most-recently-updated row first so the old constraint
    # can be re-created.
    op.execute(
        """
        DELETE FROM payer_alias a
        USING payer_alias b
        WHERE a.organization_id = b.organization_id
          AND a.normalized_payer_name = b.normalized_payer_name
          AND a.updated_at < b.updated_at
        """
    )
    op.drop_constraint(
        "uq_payer_alias_org_name_handle_applicant", "payer_alias", type_="unique"
    )
    op.create_unique_constraint(
        "uq_payer_alias_org_name",
        "payer_alias",
        ["organization_id", "normalized_payer_name"],
    )
    op.alter_column(
        "payer_alias",
        "payer_handle",
        existing_type=sa.String(length=255),
        nullable=True,
        server_default=None,
    )

    op.drop_column("transactions", "payer_handle")
