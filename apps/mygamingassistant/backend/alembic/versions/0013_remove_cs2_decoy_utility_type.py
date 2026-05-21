"""Remove cs2 decoy utility_type

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-21 00:00:00.000000

Removes the ``decoy`` utility_type row for CS2 (slug='decoy', game='cs2').
Decoys are intentionally excluded from the MGA lineup library — they're
not useful enough to warrant browsable lineups.

Data-only migration. Safe because:
  - At time of authoring zero ``lineup`` rows reference this utility_type
    (verified via SELECT COUNT(*) FROM lineup l JOIN utility_type ut ON
    l.utility_type_id = ut.id WHERE ut.slug='decoy').
  - The DELETE includes a defensive subquery on lineup so the migration
    fails loudly rather than silently orphaning rows if any operator's DB
    has decoy lineups in flight.

The matching fixture entry was removed in the same PR, so re-running
``load-fixtures`` will not re-create the row.

Downgrade re-creates the row via INSERT (idempotent against the
(game_id, slug) unique constraint).
"""
from alembic import op


revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Defensive: if any lineup references this utility_type, raise rather
    # than silently breaking the FK. This catches the case where a
    # downstream environment seeded decoy lineups between authoring + apply.
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
            WHERE ut.slug = 'decoy' AND g.slug = 'cs2';

            IF ref_count > 0 THEN
                RAISE EXCEPTION
                    'Cannot remove cs2 decoy utility_type: % lineup(s) still reference it. '
                    'Reassign or delete those lineups first.', ref_count;
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DELETE FROM utility_type
        WHERE slug = 'decoy'
          AND game_id IN (SELECT id FROM game WHERE slug = 'cs2')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO utility_type (id, game_id, slug, name, created_at)
        SELECT gen_random_uuid(), g.id, 'decoy', 'Decoy', NOW()
        FROM game g
        WHERE g.slug = 'cs2'
          AND NOT EXISTS (
            SELECT 1 FROM utility_type ut
            WHERE ut.game_id = g.id AND ut.slug = 'decoy'
          )
        """
    )
