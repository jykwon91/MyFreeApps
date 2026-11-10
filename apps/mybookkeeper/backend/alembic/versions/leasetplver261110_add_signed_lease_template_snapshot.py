"""Record which template name and version a lease was rendered from.

Each ``signed_lease_templates`` row gets ``template_name_snapshot`` and
``template_version_snapshot``, written whenever that template's files are
rendered into the lease. The name is copied because templates can be renamed
or soft-deleted after the lease is made.

Backfill (conservative): only links that have been rendered are stamped. A
generated lease renders all its templates when ``generated_at`` is set; an
imported lease only ever links a template by rendering it (adding a document).
Those rows get the template's current name, soft-deleted templates included.
A template renamed since the render backfills with its current name; that is
the best record available. Links on a never-generated draft stay NULL.

The version is stamped where it is known:

- the template is still at version 1: its files were never replaced, so
  version 1 is exactly what was rendered;
- the template row has not been updated since the lease was generated
  (``lease_templates.updated_at <= signed_leases.generated_at``). Every version
  bump has gone through SQLAlchemy (an ORM attribute set at first, a Core
  UPDATE since #1935), which fires the column's ``onupdate``, so ``updated_at``
  is at or after the last bump and the current version is the one rendered.
  Renames also move ``updated_at``, which only leaves more rows NULL. Links
  added after generation rendered later still, against the same version.

Otherwise the version stays NULL and the UI shows the name alone. One residual
gap, not detectable from stored data: before this revision a replace that
committed while a generate was rendering (seconds) was not detected, and
``generated_at`` is taken after the render, so such a lease would be stamped
with the newer version.

Revision ID: leasetplver261110
Revises: leasefileemail261110
Create Date: 2026-11-10 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "leasetplver261110"
down_revision: str | None = "leasefileemail261110"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RENDERED = (
    " EXISTS ("
    "   SELECT 1 FROM signed_leases l"
    "   WHERE l.id = signed_lease_templates.lease_id"
    "   AND (l.generated_at IS NOT NULL OR l.kind = 'imported')"
    " )"
)
BACKFILL = (
    "UPDATE signed_lease_templates"
    " SET template_name_snapshot = ("
    "   SELECT t.name FROM lease_templates t"
    "   WHERE t.id = signed_lease_templates.template_id"
    " ),"
    " template_version_snapshot = ("
    "   SELECT CASE"
    "     WHEN t.version = 1 THEN 1"
    "     WHEN l.generated_at IS NOT NULL AND t.updated_at <= l.generated_at THEN t.version"
    "   END"
    "   FROM lease_templates t, signed_leases l"
    "   WHERE t.id = signed_lease_templates.template_id"
    "   AND l.id = signed_lease_templates.lease_id"
    " )"
    " WHERE" + _RENDERED
)


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "signed_lease_templates",
        sa.Column("template_name_snapshot", sa.String(200), nullable=True),
    )
    op.add_column(
        "signed_lease_templates",
        sa.Column("template_version_snapshot", sa.Integer(), nullable=True),
    )
    op.execute(BACKFILL)


def downgrade() -> None:
    op.drop_column("signed_lease_templates", "template_version_snapshot")
    op.drop_column("signed_lease_templates", "template_name_snapshot")
