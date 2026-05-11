"""Add ``name`` column to ``discovery_sources`` and replace unique index.

Before this migration a user could have at most ONE active source per source
kind (e.g. one active Greenhouse source).  Now that multiple Greenhouse board
tokens can be tracked (e.g. Stripe's board + Airbnb's board), the uniqueness
key must include the new ``name`` column so two sources of the same kind are
disambiguated by their operator-supplied name.

Changes:
1. Add ``name VARCHAR(100) NOT NULL DEFAULT ''`` to ``discovery_sources``.
2. Backfill ``name`` from config JSONB — JSearch rows use ``config->>'query'``
   (truncated to 100 chars); Greenhouse rows use ``config->>'board_token'``;
   Lever rows use ``config->>'company_slug'``.  All other source kinds get an
   empty-string name.
3. Drop the old partial unique index ``uq_discovery_source_user_kind``
   (``UNIQUE(user_id, source) WHERE is_active = true``).
4. Create the new partial unique index ``uq_discovery_source_user_kind_name``
   (``UNIQUE(user_id, source, name) WHERE is_active = true``).

Backward-compatible: the column has a server-default of empty string so
existing rows (and inserts that omit ``name``) continue to work.  Two sources
of the same kind with both names = '' still collide — the operator must
supply distinct names to have two active sources of the same kind.

Revision ID: discnam260511
Revises: discsrc260511
Create Date: 2026-05-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "discnam260511"
down_revision: Union[str, None] = "discsrc260511"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add the column with a server-side default of empty string so it is
    #    NOT NULL without requiring a value from application code on existing
    #    rows.
    op.add_column(
        "discovery_sources",
        sa.Column(
            "name",
            sa.String(100),
            nullable=False,
            server_default="",
        ),
    )

    # 2. Backfill: derive a human-readable name from each row's config so
    #    existing sources are labelled meaningfully after the migration.
    #
    #    JSearch:    config->>'query'            (truncated to 100 chars)
    #    Greenhouse: config->>'board_token'
    #    Lever:      config->>'company_slug'
    #    Other:      empty string (server default already set it)
    #
    #    LEFT(expr, 100) keeps us within the VARCHAR(100) limit even when
    #    the JSearch query is very long.
    op.execute(
        """
        UPDATE discovery_sources
        SET name = CASE
            WHEN source = 'jsearch'
                THEN LEFT(COALESCE(config->>'query', ''), 100)
            WHEN source = 'greenhouse'
                THEN LEFT(COALESCE(config->>'board_token', ''), 100)
            WHEN source = 'lever'
                THEN LEFT(COALESCE(config->>'company_slug', ''), 100)
            ELSE ''
        END
        """,
    )

    # 3. Drop the old partial unique index.
    op.drop_index(
        "uq_discovery_source_user_kind",
        table_name="discovery_sources",
    )

    # 4. Create the new three-column partial unique index.
    op.create_index(
        "uq_discovery_source_user_kind_name",
        "discovery_sources",
        ["user_id", "source", "name"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )


def downgrade() -> None:
    # Reverse: drop the new index, recreate the old one, then remove the column.
    op.drop_index(
        "uq_discovery_source_user_kind_name",
        table_name="discovery_sources",
    )

    op.create_index(
        "uq_discovery_source_user_kind",
        "discovery_sources",
        ["user_id", "source"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )

    op.drop_column("discovery_sources", "name")
