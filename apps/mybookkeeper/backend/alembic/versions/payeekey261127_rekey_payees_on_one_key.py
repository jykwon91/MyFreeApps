"""Re-key remembered loan payees and vendor payee rules on the one payee key.

Payees are now matched on ``payee_key`` (``app/core/payee_keys``): the payee
without the payment app's prefix and without the payment reference, so
"Zelle payment to Silvia 29520127614" and a manual "zelle payment to silvia"
are both "silvia". Rows stored on an older key are re-keyed:

- ``loan_payees.normalized_payee`` = ``payee_key(display_name)``. ``display_name``
  is the payee as it was tagged, so a tag on "Silvia 29520127614" becomes "silvia".
  An ACH company ID names the payee and stays: "JPMORGAN CHASE CHASE ACH PPD ID:
  1000008113" keeps its key.
- ``classification_rules.match_pattern`` of every vendor rule =
  ``payee_key(match_pattern)``.

Collisions (two rows of a workspace with the same new key, and for rules the same
match context): one row is kept and the others are deleted. A rule a person made
(``source = 'manual'``) is kept over a learned one, then the newest (``updated_at``,
then ``created_at``) over older ones; a deleted rule's split properties go with it
(CASCADE). For loan payees, the newest tag is kept.

Downgrade restores each loan payee's old key (``display_name`` case-folded with
whitespace collapsed); a row deleted as a duplicate isn't restored, but the row
kept covers the same payee. Vendor rule patterns stay re-keyed: the old code
matches a pattern contained in the descriptor, and the new key always is.

Uses the app's ``payee_key`` rather than a copy, so there is one payee normaliser.

Revision ID: payeekey261127
Revises: payeerule261127
Create Date: 2026-11-27
"""
from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection, Row

from app.core.payee_keys import payee_key

revision = "payeekey261127"
down_revision = "payeerule261127"
branch_labels = None
depends_on = None

_MANUAL_SOURCE = "manual"
_TIMESTAMP = sa.DateTime(timezone=True)


def _rekey(
    bind: Connection,
    table: str,
    key_column: str,
    rows: Sequence[Row[Any]],
    new_key: Callable[[Row[Any]], str],
    group: Callable[[Row[Any], str], tuple[Any, ...]],
    keep_first: Callable[[Row[Any]], tuple[Any, ...]],
) -> None:
    """Give each row its new key; of rows sharing a group, keep the first by ``keep_first``.

    Every duplicate is deleted before any row is re-keyed, so no update meets a
    duplicate still holding its key.
    """
    groups: dict[tuple[Any, ...], list[tuple[Row[Any], str]]] = {}
    for row in rows:
        key = new_key(row)
        groups.setdefault(group(row, key), []).append((row, key))
    kept: list[tuple[Row[Any], str]] = []
    for members in groups.values():
        members.sort(key=lambda member: keep_first(member[0]))
        kept.append(members[0])
        for row, _ in members[1:]:
            bind.execute(sa.text(f"DELETE FROM {table} WHERE id = :id"), {"id": row.id})
    for row, key in kept:
        if getattr(row, key_column) != key:
            bind.execute(sa.text(f"UPDATE {table} SET {key_column} = :key WHERE id = :id"), {"key": key, "id": row.id})


def _newest_first(stamp: datetime | None) -> float:
    """Sorts the newest first; a missing time last."""
    return math.inf if stamp is None else -stamp.timestamp()


def upgrade() -> None:
    bind = op.get_bind()
    loan_payees = bind.execute(
        sa.text("SELECT id, organization_id, display_name, normalized_payee, created_at FROM loan_payees")
        .columns(created_at=_TIMESTAMP),
    ).all()
    _rekey(
        bind,
        "loan_payees",
        "normalized_payee",
        loan_payees,
        new_key=lambda row: payee_key(row.display_name, None) or row.normalized_payee,
        group=lambda row, key: (row.organization_id, key),
        keep_first=lambda row: (_newest_first(row.created_at), str(row.id)),
    )
    rules = bind.execute(
        sa.text(
            "SELECT id, organization_id, match_pattern, match_context, source, updated_at, created_at "
            "FROM classification_rules WHERE match_type = 'vendor'",
        ).columns(updated_at=_TIMESTAMP, created_at=_TIMESTAMP),
    ).all()
    _rekey(
        bind,
        "classification_rules",
        "match_pattern",
        rules,
        new_key=lambda row: payee_key(row.match_pattern, None) or row.match_pattern,
        group=lambda row, key: (row.organization_id, key, row.match_context),
        keep_first=lambda row: (
            row.source != _MANUAL_SOURCE,
            _newest_first(row.updated_at),
            _newest_first(row.created_at),
            str(row.id),
        ),
    )


def downgrade() -> None:
    bind = op.get_bind()
    for row in bind.execute(sa.text("SELECT id, display_name FROM loan_payees")).all():
        old_key = " ".join(row.display_name.split()).casefold()
        if old_key:
            bind.execute(
                sa.text("UPDATE loan_payees SET normalized_payee = :key WHERE id = :id"),
                {"key": old_key, "id": row.id},
            )
