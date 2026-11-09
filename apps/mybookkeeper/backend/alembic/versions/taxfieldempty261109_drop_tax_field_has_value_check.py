"""Allow tax form fields with no value.

A user can now explicitly clear an overridden field, so a row may have all
three value columns NULL.

Revision ID: taxfieldempty261109
Revises: contactemail261108
Create Date: 2026-11-09 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op

revision: str = "taxfieldempty261109"
down_revision: str | None = "contactemail261108"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("chk_tff_has_value", "tax_form_fields", type_="check")


def downgrade() -> None:
    op.execute(
        "DELETE FROM tax_form_fields WHERE value_numeric IS NULL "
        "AND value_text IS NULL AND value_boolean IS NULL"
    )
    op.create_check_constraint(
        "chk_tff_has_value",
        "tax_form_fields",
        "value_numeric IS NOT NULL OR value_text IS NOT NULL OR value_boolean IS NOT NULL",
    )
