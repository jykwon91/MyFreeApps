"""Clear discovered jobs' links to soft-deleted applications.

Applications are soft-deleted, so ``discovered_jobs.promoted_application_id``
(``ON DELETE SET NULL``) kept pointing at a deleted application, and the
posting stayed out of Discover for good. Deleting an application now clears
the link in the same transaction (``discovery_promotion_repository``); this
clears the links left before that, with ``promoted_at`` alongside per
``chk_discovered_promoted``. The postings then return to Discover, and Apply
makes a fresh application, as it already did for them.

Data-only. Downgrade is a no-op: the cleared links pointed at deleted
applications and nothing reads them.

Revision ID: promolink261113
Revises: dismix261113
Create Date: 2026-11-13
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection

revision: str = "promolink261113"
down_revision: Union[str, None] = "dismix261113"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CLEAR_DEAD_LINKS = sa.text(
    "UPDATE discovered_jobs AS d SET promoted_application_id = NULL, promoted_at = NULL "
    "FROM applications AS a "
    "WHERE a.id = d.promoted_application_id AND a.deleted_at IS NOT NULL"
)


def upgrade() -> None:
    clear_links_to_deleted_applications(op.get_bind())


def downgrade() -> None:
    pass


def clear_links_to_deleted_applications(bind: Connection) -> None:
    """Unlink every discovered job from a soft-deleted application."""
    bind.execute(_CLEAR_DEAD_LINKS)
