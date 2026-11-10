"""Add scheduler_job — the scheduler process's job table

Revision ID: 0053
Revises: 0052
Create Date: 2026-11-10 00:00:00.000000

WHY. APScheduler used to start inside the API lifespan, and the API runs
``uvicorn --workers 2``, so every scheduled job ran once per worker. It now
runs in one dedicated ``scheduler`` service, so the API can no longer read
or poke the scheduler in memory. This table is the channel between them:
the scheduler writes one row per job each tick (status for
``GET /scheduler/status``, and the next run a restart resumes from), and
``POST /scheduler/trigger/{job_id}`` sets ``run_requested_at`` for the
scheduler to pick up. See ``app/models/system/scheduler_job.py``. Starts
empty; the scheduler fills it on its first tick.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0053"
down_revision: Union[str, None] = "0052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scheduler_job",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=False),
        sa.Column("trigger", sa.String(length=255), nullable=False),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("run_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", name="uq_schedulerjob_job_id"),
    )


def downgrade() -> None:
    op.drop_table("scheduler_job")
