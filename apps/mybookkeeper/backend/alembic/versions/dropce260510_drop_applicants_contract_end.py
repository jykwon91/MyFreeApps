"""Drop ``applicants.contract_end`` — value is now derived from latest signed lease.

Per the lease extension feature design (project memory:
``project_lease_extension_feature_design.md``), ``applicant.contract_end``
is replaced with a Python ``@property`` that reads from the latest non-deleted
``signed_leases.ends_on`` for that applicant. Eliminates the third write-site
bug the extension service would otherwise introduce.

Pre-signature, the property returns ``None`` — the host enters the end date
when creating the lease draft, not on the applicant.

Downgrade re-adds the column as nullable Date. Data is NOT recoverable on
downgrade (the column was dropped); affected rows will read ``NULL``.

Revision ID: dropce260510
Revises: ltvers260510
Create Date: 2026-05-10 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "dropce260510"
down_revision: Union[str, None] = "ltvers260510"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("applicants", "contract_end")


def downgrade() -> None:
    op.add_column(
        "applicants",
        sa.Column("contract_end", sa.Date(), nullable=True),
    )
