"""add property classification column

Revision ID: b124e8813fae
Revises: a3cecc2fda30
Create Date: 2026-04-02 13:14:12.833008

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b124e8813fae'
down_revision: Union[str, None] = 'a3cecc2fda30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the enum type
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE propertyclassification AS ENUM (
                'INVESTMENT', 'PRIMARY_RESIDENCE', 'SECOND_HOME', 'UNCLASSIFIED'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$
    """)

    # Add classification column with server default
    op.execute("""
        ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS classification propertyclassification
        NOT NULL DEFAULT 'UNCLASSIFIED'
    """)

    # Backfill: existing properties are rentals -> INVESTMENT
    op.execute("UPDATE properties SET classification = 'INVESTMENT' WHERE type IS NOT NULL")

    # Make type nullable (non-rental properties don't have a rental type)
    op.execute("ALTER TABLE properties ALTER COLUMN type DROP NOT NULL")

    # Add CHECK: investment requires type; primary/second home forbids type
    op.execute("""
        ALTER TABLE properties ADD CONSTRAINT chk_prop_classification_type CHECK (
            (classification = 'INVESTMENT' AND type IS NOT NULL) OR
            (classification IN ('PRIMARY_RESIDENCE', 'SECOND_HOME') AND type IS NULL) OR
            (classification = 'UNCLASSIFIED')
        )
    """)

    # Index for filtering by classification
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_prop_org_classification "
        "ON properties (organization_id, classification)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_prop_org_classification")
    op.execute("ALTER TABLE properties DROP CONSTRAINT IF EXISTS chk_prop_classification_type")

    # Set all unclassified to SHORT_TERM before re-adding NOT NULL
    op.execute("UPDATE properties SET type = 'SHORT_TERM' WHERE type IS NULL")
    op.execute("ALTER TABLE properties ALTER COLUMN type SET NOT NULL")

    op.execute("ALTER TABLE properties DROP COLUMN IF EXISTS classification")
    op.execute("DROP TYPE IF EXISTS propertyclassification")
