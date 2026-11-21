"""Reply template names are unique per organization, not per person overall.

``reply_templates`` was ``UNIQUE (user_id, name)``, but every template belongs
to an organization. Someone in two organizations could not reuse a name in the
second one, and the starter templates were skipped there because their names
already existed in the first, so the second organization started empty.

The constraint becomes ``UNIQUE (organization_id, user_id, name)``. It is
deliberately not partial: archived templates keep their names and still count,
which is how the app treats them (see ``NAME_TAKEN_MESSAGE``).

No rows are read, changed or deleted. Every existing row already satisfies the
old, narrower constraint, so it satisfies the new one. The new constraint is
added before the old one is dropped so uniqueness is never unenforced.

Revision ID: rtplorgname261121
Revises: emailqueueidx261120
Create Date: 2026-11-21 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op

revision: str = "rtplorgname261121"
down_revision: str | None = "emailqueueidx261120"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "reply_templates"
_OLD = "uq_reply_template_user_name"
_NEW = "uq_reply_template_org_user_name"


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    with op.batch_alter_table(_TABLE) as batch:
        batch.create_unique_constraint(_NEW, ["organization_id", "user_id", "name"])
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_constraint(_OLD, type_="unique")


def downgrade() -> None:
    # Fails if a person has since reused a name in a second organization;
    # those rows are never deleted for them, so resolve the clash by hand.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    with op.batch_alter_table(_TABLE) as batch:
        batch.create_unique_constraint(_OLD, ["user_id", "name"])
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_constraint(_NEW, type_="unique")
