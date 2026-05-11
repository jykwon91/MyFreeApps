"""Extend discovery source CHECK constraints to permit 'greenhouse' and 'lever'.

Both Greenhouse and Lever were already listed as valid source KIND values in the
original ``disco260507`` migration (they were part of the intended set from day
one), so this migration is a no-op from a DB perspective — the values are
already in the CHECK constraint.

Wait — let me re-check.  The original migration's ``_DISCOVERY_SOURCE_KINDS``
tuple includes ``"greenhouse"`` and ``"lever"`` already.  The CHECK constraint
on ``discovery_sources.source`` and ``discovered_jobs.source`` already permits
those values.

This migration therefore has NO constraint change to make.  It is kept as an
explicit record in the revision chain to document that:

1. The Greenhouse and Lever adapters are now implemented (PR adds them).
2. No DB schema change is required — the existing CHECK constraints already
   permit these values, as they were included in the original design.
3. The migration applies and rolls back cleanly (it's a no-op migration).

Revision ID: discsrc260511
Revises: ixinbox260508
Create Date: 2026-05-11
"""
from typing import Sequence, Union


revision: str = "discsrc260511"
down_revision: Union[str, None] = "ixinbox260508"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No schema changes needed.  The 'greenhouse' and 'lever' values were
    # already included in the CHECK constraints from the original
    # disco260507 migration:
    #
    #   chk_discovery_source  on discovery_sources.source
    #   chk_discovered_source on discovered_jobs.source
    #
    # Both constraints already include:
    #   'greenhouse', 'lever', 'ashby', 'remoteok', 'hn_who_is_hiring',
    #   'workatastartup', 'jsearch', 'other'
    #
    # This migration exists as a no-op revision in the chain so that:
    # a) The alembic history clearly marks when the adapters shipped.
    # b) Future migrations have an unambiguous prior revision to chain from.
    pass


def downgrade() -> None:
    # No schema changes to revert.
    pass
