"""Downgrading the has-value CHECK drop must not delete user data."""
import importlib.util
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.db.base import Base

_MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic" / "versions" / "taxfieldempty261109_drop_tax_field_has_value_check.py"
)


def _downgrade(conn: sa.Connection) -> None:
    spec = importlib.util.spec_from_file_location("taxfieldempty", _MIGRATION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with Operations.context(MigrationContext.configure(conn)):
        module.downgrade()


def _engine_with_field(**values: object) -> sa.Engine:
    engine = sa.create_engine("sqlite://")
    tables = [Base.metadata.tables["tax_form_instances"], Base.metadata.tables["tax_form_fields"]]
    Base.metadata.create_all(engine, tables=tables)
    inst_id = uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(tables[0].insert().values(
            id=inst_id, tax_return_id=uuid.uuid4(), form_name="w2",
            source_type="extracted", status="draft",
        ))
        conn.execute(tables[1].insert().values(
            id=uuid.uuid4(), form_instance_id=inst_id, field_id="box_1", field_label="Wages",
            is_calculated=False, is_overridden=True, validation_status="unvalidated", **values,
        ))
    return engine


def test_downgrade_refuses_when_cleared_rows_exist() -> None:
    engine = _engine_with_field()
    with engine.connect() as conn:
        with pytest.raises(RuntimeError, match="1 tax_form_fields rows have no value"):
            _downgrade(conn)
    with engine.connect() as conn:
        assert conn.execute(sa.text("SELECT COUNT(*) FROM tax_form_fields")).scalar_one() == 1
