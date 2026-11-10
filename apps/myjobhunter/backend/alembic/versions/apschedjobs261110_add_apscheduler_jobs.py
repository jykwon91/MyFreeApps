"""Add apscheduler_jobs: the discovery scheduler's jobstore table

Revision ID: apschedjobs261110
Revises: refreshsess261103
Create Date: 2026-11-10 00:00:00.000000

APScheduler's SQLAlchemyJobStore used to create this table itself at
runtime. With two API workers each starting a scheduler, both raced the
DDL on a fresh database and one crashed (UniqueViolation on
pg_type_typname_nsp_index). The scheduler now runs in one dedicated
process and refuses to start without this table, so schema creation
lives here, under alembic's advisory lock.

The schema matches SQLAlchemyJobStore (APScheduler 3.x) column for column.
Existing databases already have the runtime-created table with that exact
schema, so upgrade only creates it when absent.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "apschedjobs261110"
down_revision: Union[str, None] = "refreshsess261103"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "apscheduler_jobs"


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(_TABLE):
        return
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Unicode(191), primary_key=True),
        sa.Column("next_run_time", sa.Float(25), nullable=True),
        sa.Column("job_state", sa.LargeBinary(), nullable=False),
    )
    op.create_index(
        "ix_apscheduler_jobs_next_run_time", _TABLE, ["next_run_time"],
    )


def downgrade() -> None:
    # In production the table pre-dates this migration (APScheduler created
    # it at runtime), yet downgrade still drops it: every persisted job and
    # its next_run_time is lost. The pre-migration code recreates the table
    # on its next start and re-registers every active source, so schedules
    # reset to "now + interval" rather than break.
    op.drop_index("ix_apscheduler_jobs_next_run_time", table_name=_TABLE)
    op.drop_table(_TABLE)
