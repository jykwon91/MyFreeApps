"""Add ``companies.research_started_at``.

A company's research run (Tavily search + Claude) was claimed with a
transaction-scoped advisory lock, so the request held a pooled connection idle
in a transaction for the whole run. The claim is now a timestamp on the row,
taken and cleared in short transactions; a stale one (a crashed worker) expires.
Additive and nullable: existing rows and old code keep working.

Revision ID: researchclaim261121
Revises: prepretry261121
Create Date: 2026-11-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "researchclaim261121"
down_revision: Union[str, None] = "prepretry261121"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("research_started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("companies", "research_started_at")
