"""The ``apschedjobs261110`` migration creates the scheduler jobstore table.

The scheduler refuses to auto-create it at runtime (two processes racing
that DDL crashed the API on a fresh DB), so the migrated schema must match
what APScheduler's SQLAlchemyJobStore expects, column for column.
"""
from __future__ import annotations

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from sqlalchemy import create_engine, inspect

from app.core.config import settings
from app.core.discovery_scheduler_constants import JOBSTORE_TABLE_NAME


def test_migration_creates_jobstore_table_matching_apscheduler() -> None:
    engine = create_engine(settings.database_url_sync)
    try:
        insp = inspect(engine)
        assert insp.has_table(JOBSTORE_TABLE_NAME)

        columns = {c["name"]: c for c in insp.get_columns(JOBSTORE_TABLE_NAME)}
        expected = SQLAlchemyJobStore(engine=engine, tablename=JOBSTORE_TABLE_NAME).jobs_t
        assert set(columns) == {c.name for c in expected.columns}
        for col in expected.columns:
            assert columns[col.name]["nullable"] == col.nullable, col.name
            assert columns[col.name]["type"]._type_affinity is col.type._type_affinity, col.name

        # 191 = APScheduler's id length (MySQL utf8mb4 key limit); a shorter
        # column would truncate/reject long job ids.
        assert columns["id"]["type"].length == 191

        assert insp.get_pk_constraint(JOBSTORE_TABLE_NAME)["constrained_columns"] == ["id"]
        indexed = {tuple(ix["column_names"]) for ix in insp.get_indexes(JOBSTORE_TABLE_NAME)}
        assert ("next_run_time",) in indexed
    finally:
        engine.dispose()
