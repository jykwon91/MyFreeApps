"""Add utility_type.placement ('thrown' | 'placed')

Revision ID: 0021
Revises: 0020
Create Date: 2026-07-30 00:00:00.000000

Adds a NOT NULL ``placement`` column to ``utility_type``, constrained to
``'thrown'`` or ``'placed'``, defaulting to ``'thrown'``.

WHY. The lineup pipeline has assumed every utility travels through the air, so a
lineup is four beats: STAND -> AIM -> THROW -> LANDING. That assumption holds for
every utility type seeded so far, but it excludes most of the sentinel kit.
Cypher's trapwire and spycam are MOUNTED on a surface — the player walks to a
spot, looks at the surface and angle, and deploys. There is a stand, there is an
aim (the surface and angle are the entire lesson), and there is a landing (the
deployed device), but nothing is ever in flight, so there is no throw. That is a
complete three-beat lineup, not a four-beat lineup with a hole in it.

The distinction belongs on the utility type because it is a property of the
ability itself, not of any individual clip: every trapwire lineup ever recorded
is placed, and no hot-hands lineup ever is. Storing it per-lineup would invite
the two to disagree.

BACKFILL. ``server_default='thrown'`` backfills every existing row, which is
correct and not merely convenient — cyber-cage, all of CS2's grenades, and every
Valorant ability seeded to date are genuinely thrown. The fixture loader then
flips ``trapwire`` and ``spycam`` to ``'placed'`` on the next
``load-fixtures`` run.

The value set is a String + CheckConstraint rather than a PG ENUM, per the schema
convention: widening it later (a future 'deployed' for Killjoy's turret, say) is
an ALTER of a constraint rather than an ALTER TYPE that must be coordinated
across every app sharing the cluster.

Downgrade drops the constraint and the column; three-beat lineups keep their
NULL ``clip_url`` and render via the existing placeholder, so nothing breaks —
the app simply loses the ability to say WHY the throw is absent.
"""
import sqlalchemy as sa
from alembic import op


revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "utility_type",
        sa.Column(
            "placement",
            sa.String(length=10),
            nullable=False,
            server_default="thrown",
        ),
    )
    op.create_check_constraint(
        "ck_utilitytype_placement",
        "utility_type",
        "placement IN ('thrown', 'placed')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_utilitytype_placement", "utility_type", type_="check")
    op.drop_column("utility_type", "placement")
