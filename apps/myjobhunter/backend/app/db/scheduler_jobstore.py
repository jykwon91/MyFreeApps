"""APScheduler jobstore for the discovery scheduler process.

``SQLAlchemyJobStore.start()`` runs ``CREATE TABLE`` (checkfirst) on its
own. The table is owned by an alembic migration instead, so this factory
refuses to hand out a jobstore when the table is missing: a scheduler that
boots against an unmigrated database crashes instead of quietly creating
schema outside alembic's history.
"""
from __future__ import annotations

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from sqlalchemy import create_engine, inspect

from app.core.discovery_scheduler_constants import JOBSTORE_TABLE_NAME


class SchedulerJobstoreMissingError(RuntimeError):
    """The jobstore table does not exist — migrations have not been applied."""


def build_scheduler_jobstore(database_url_sync: str) -> SQLAlchemyJobStore:
    """Return a jobstore on the app's Postgres, verifying its table exists.

    Raises:
        SchedulerJobstoreMissingError: ``apscheduler_jobs`` is absent.
        sqlalchemy.exc.OperationalError: Postgres is unreachable.
    """
    engine = create_engine(database_url_sync, pool_pre_ping=True)
    if not inspect(engine).has_table(JOBSTORE_TABLE_NAME):
        engine.dispose()
        raise SchedulerJobstoreMissingError(
            f"table {JOBSTORE_TABLE_NAME!r} does not exist — run "
            "`alembic upgrade head` before starting the discovery scheduler",
        )
    return SQLAlchemyJobStore(engine=engine, tablename=JOBSTORE_TABLE_NAME)
