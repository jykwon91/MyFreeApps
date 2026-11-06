"""one integration per org and provider, not per user

Every lookup and the OAuth upsert find an org's connection by
(organization_id, provider), but the table was unique on (user_id, provider).
So a member of two orgs couldn't connect Gmail in the second (the insert hit
the per-user key), and nothing stopped one org from getting two rows.

The unique key moves to (organization_id, provider). ``user_id`` (the member
who connected it) gets a plain index for the ON DELETE CASCADE from users.

Neither direction deletes rows to fit the new key. If existing rows break it,
the migration stops and says how many groups clash, for an operator to resolve.

Revision ID: intgorgkey261106
Revises: sendclaimacct261106
Create Date: 2026-11-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "intgorgkey261106"
down_revision: Union[str, None] = "sendclaimacct261106"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _refuse_if_duplicated(owner_column: str, target_key: str) -> None:
    clashes = op.get_bind().execute(
        sa.text(
            "SELECT count(*) FROM ("
            f"SELECT 1 FROM integrations GROUP BY {owner_column}, provider HAVING count(*) > 1"
            ") AS dup"
        )
    ).scalar_one()
    if clashes:
        raise RuntimeError(
            f"{clashes} ({owner_column}, provider) group(s) in integrations have more than one row, "
            f"so {target_key} can't be added. Decide which row each keeps, delete the others, and rerun."
        )


def upgrade() -> None:
    _refuse_if_duplicated("organization_id", "uq_integration_org_provider")
    op.drop_constraint("uq_integration_user_provider", "integrations", type_="unique")
    op.create_unique_constraint(
        "uq_integration_org_provider", "integrations", ["organization_id", "provider"]
    )
    op.create_index("ix_integrations_user_id", "integrations", ["user_id"])


def downgrade() -> None:
    _refuse_if_duplicated("user_id", "uq_integration_user_provider")
    op.drop_index("ix_integrations_user_id", table_name="integrations")
    op.drop_constraint("uq_integration_org_provider", "integrations", type_="unique")
    op.create_unique_constraint(
        "uq_integration_user_provider", "integrations", ["user_id", "provider"]
    )
