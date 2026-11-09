"""Legacy tax field values move to their declared column (taxfieldcols261109)."""
import importlib.util
import uuid
from decimal import Decimal
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.db.base import Base
from app.mappers.tax_form_mapper import FieldValueColumns, relocate_legacy_value

_MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic" / "versions" / "taxfieldcols261109_move_tax_values_to_declared_column.py"
)


class TestRelocateLegacyValue:
    def test_numeric_in_text_field_becomes_text(self) -> None:
        moved = relocate_legacy_value("1099_r", "box_7", FieldValueColumns(numeric=Decimal("7.00")))
        assert moved == FieldValueColumns(text="7")

    def test_fractional_numeric_keeps_its_digits(self) -> None:
        moved = relocate_legacy_value("1099_r", "box_7", FieldValueColumns(numeric=Decimal("7.50")))
        assert moved == FieldValueColumns(text="7.5")

    def test_clean_text_in_numeric_field_becomes_numeric(self) -> None:
        moved = relocate_legacy_value("w2", "box_1", FieldValueColumns(text="$1,234.00"))
        assert moved == FieldValueColumns(numeric=Decimal("1234.00"))

    def test_unparseable_text_in_numeric_field_stays(self) -> None:
        assert relocate_legacy_value("w2", "box_1", FieldValueColumns(text="n/a")) is None

    def test_row_in_correct_column_stays(self) -> None:
        assert relocate_legacy_value("w2", "box_1", FieldValueColumns(numeric=Decimal("1"))) is None

    def test_ambiguous_row_stays(self) -> None:
        both = FieldValueColumns(numeric=Decimal("7"), text="G")
        assert relocate_legacy_value("1099_r", "box_7", both) is None

    def test_undeclared_field_stays(self) -> None:
        assert relocate_legacy_value("w2", "custom", FieldValueColumns(text="5")) is None


def test_upgrade_moves_only_clean_mismatches() -> None:
    engine = sa.create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[
        Base.metadata.tables["tax_form_instances"], Base.metadata.tables["tax_form_fields"],
    ])
    instances = Base.metadata.tables["tax_form_instances"]
    fields = Base.metadata.tables["tax_form_fields"]
    inst_id = uuid.uuid4()
    rows = {
        "text_with_number": ("1099_r", "box_7", {"value_numeric": Decimal("7.00")}),
        "number_with_text": ("1099_r", "box_1", {"value_text": "1,234.50"}),
        "number_with_junk": ("1099_r", "box_14", {"value_text": "see attached"}),
    }
    with engine.begin() as conn:
        conn.execute(instances.insert().values(
            id=inst_id, tax_return_id=uuid.uuid4(), form_name="1099_r", source_type="extracted",
            status="draft",
        ))
        ids = {}
        for name, (_, field_id, cols) in rows.items():
            ids[name] = uuid.uuid4()
            conn.execute(fields.insert().values(
                id=ids[name], form_instance_id=inst_id, field_id=field_id,
                field_label=field_id, is_calculated=False, is_overridden=False,
                validation_status="unvalidated", **cols,
            ))

        spec = importlib.util.spec_from_file_location("taxfieldcols", _MIGRATION)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with Operations.context(MigrationContext.configure(conn)):
            module.upgrade()

        got = {
            r.id: r for r in conn.execute(sa.select(fields)).fetchall()
        }
    assert got[ids["text_with_number"]].value_text == "7"
    assert got[ids["text_with_number"]].value_numeric is None
    assert got[ids["number_with_text"]].value_numeric == Decimal("1234.50")
    assert got[ids["number_with_text"]].value_text is None
    assert got[ids["number_with_junk"]].value_text == "see attached"
    assert got[ids["number_with_junk"]].value_numeric is None
