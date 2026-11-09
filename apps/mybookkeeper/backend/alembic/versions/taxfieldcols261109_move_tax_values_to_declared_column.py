"""Move legacy tax field values into their declared type's column.

Extraction used to store anything numeric-looking in value_numeric and
anything else in value_text, whatever the field's type. A lone value in the
wrong column that converts cleanly is moved (text field holding 7.00 ->
"7"; numeric field holding "1,234.00" -> 1234.00). Ambiguous rows (several
columns set) and values that do not convert are left for the read fallback.

Downgrade is a no-op: both layouts are readable (get_form_instances falls
back to whichever column is set) and the original formatting is not kept.

Revision ID: taxfieldcols261109
Revises: taxfieldempty261109
Create Date: 2026-11-09 00:10:00.000000
"""
from collections.abc import Sequence
from decimal import Decimal

import sqlalchemy as sa
from alembic import op

from app.mappers.tax_form_mapper import FieldValueColumns, relocate_legacy_value

revision: str = "taxfieldcols261109"
down_revision: str | None = "taxfieldempty261109"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT f.id, i.form_name, f.field_id, f.value_numeric, f.value_text, f.value_boolean "
        "FROM tax_form_fields f JOIN tax_form_instances i ON i.id = f.form_instance_id "
        "WHERE (f.value_numeric IS NULL) <> (f.value_text IS NULL)"
    )).fetchall()
    update = sa.text(
        "UPDATE tax_form_fields SET value_numeric = :numeric, value_text = :text, "
        "value_boolean = :boolean WHERE id = :id"
    ).bindparams(sa.bindparam("numeric", type_=sa.Numeric(12, 2)))
    for row in rows:
        moved = relocate_legacy_value(
            row.form_name, row.field_id,
            FieldValueColumns(
                None if row.value_numeric is None else Decimal(str(row.value_numeric)),
                row.value_text,
                row.value_boolean,
            ),
        )
        if moved is not None:
            bind.execute(update, {
                "id": row.id, "numeric": moved.numeric,
                "text": moved.text, "boolean": moved.boolean,
            })


def downgrade() -> None:
    pass
