"""Add agent table + utility_type.agent_id (Valorant agent dimension)

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-30 10:30:00.000000

Adds the ``agent`` taxonomy table (Valorant playable characters) and a nullable
``utility_type.agent_id`` FK so Valorant utilities can be filtered by agent
(Sova → Recon Bolt / Shock Bolt). CS2 utilities keep ``agent_id = NULL``.

Schema + prune ONLY. Agent rows and the ``agent_id`` *values* on Valorant
utility types are seeded by ``load-fixtures`` (``agents.json`` +
``utility_types.json``), which runs after this migration on every deploy — this
matches the repo convention of keeping seed data out of migrations.

The ``utility_type`` (game_id, slug) unique constraint is intentionally
unchanged: Valorant ability slugs are globally unique within the game, so the
lineup pack / importer keep resolving utility types by slug alone.

Prune: the 3 generic Valorant utility types (``smoke`` / ``flash`` / ``molotov``)
were placeholders and have zero lineups — they are replaced by agent-specific
abilities in the restructured fixture. The DELETE is guarded (0013 pattern): it
fails loud rather than orphaning rows if any environment seeded lineups against
them.

Downgrade drops the column + table. It does NOT re-create the pruned generic
utility types (they were unused and removed from the fixture too).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["game_id"], ["game.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("game_id", "slug", name="uq_agent_game_slug"),
    )
    op.create_index("ix_agent_game_id", "agent", ["game_id"])

    op.add_column(
        "utility_type",
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_utility_type_agent_id",
        "utility_type",
        "agent",
        ["agent_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_utilitytype_agent_id", "utility_type", ["agent_id"])

    # Guarded prune of the 3 unused generic Valorant utility types. Fail loud if
    # any lineup references them rather than silently breaking the FK.
    op.execute(
        """
        DO $$
        DECLARE
            ref_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO ref_count
            FROM lineup l
            JOIN utility_type ut ON l.utility_type_id = ut.id
            JOIN game g ON ut.game_id = g.id
            WHERE g.slug = 'valorant'
              AND ut.slug IN ('smoke', 'flash', 'molotov');

            IF ref_count > 0 THEN
                RAISE EXCEPTION
                    'Cannot prune generic Valorant utility types: % lineup(s) still '
                    'reference them. Reassign those lineups to an agent ability first.',
                    ref_count;
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DELETE FROM utility_type
        WHERE slug IN ('smoke', 'flash', 'molotov')
          AND game_id IN (SELECT id FROM game WHERE slug = 'valorant')
        """
    )


def downgrade() -> None:
    op.drop_index("ix_utilitytype_agent_id", table_name="utility_type")
    op.drop_constraint("fk_utility_type_agent_id", "utility_type", type_="foreignkey")
    op.drop_column("utility_type", "agent_id")
    op.drop_index("ix_agent_game_id", table_name="agent")
    op.drop_table("agent")
