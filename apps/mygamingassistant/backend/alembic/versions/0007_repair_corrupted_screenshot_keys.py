"""Repair lineup screenshot columns corrupted with presigned URLs

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-16 00:00:00.000000

Data-repair migration for the double-signing bug.

``lineup_service._sign_lineup`` used to assign the presigned GET URL back
onto the ORM instance's ``stand_screenshot_url`` / ``aim_screenshot_url``
attributes. Because the accept / bulk-accept / hide flows commit the request
session, that mutation was flushed into the **object-key** column, replacing
the bare key (``pending/<vid>/<n>-stand.png`` or
``<user_id>/<lineup_id>/stand.png``) with a full presigned URL. Every later
read then signed that URL *again* — producing a URL whose S3 object key was
a URL-encoded URL → 404 → broken ``<img>`` in the lineup detail panel.

The code fix (``lineup_service._build_read``) stops the corruption going
forward, but rows accepted before the fix still hold a presigned URL in the
key column. This migration peels every URL layer back to the bare object key
and writes it back, so signing on read resolves to the real object again.

Idempotent: bare keys never start with ``http``; re-running this migration
selects nothing.

Downgrade is intentionally a no-op — the original (already buggy) presigned
URL carried an embedded expiry and signature that there is no value in
reconstructing. Rolling back the code is the supported revert path; the
repaired bare keys are correct input for the *old* code too (it signed
whatever the column held; a bare key is exactly what it expected before the
bug), so leaving them repaired is strictly safer than re-corrupting them.
"""
from urllib.parse import unquote, urlsplit

import sqlalchemy as sa
from alembic import op


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def _object_key_from_value(value: str) -> str:
    """Peel presigned-URL layers down to the bare object key.

    Mirrors ``app.services.game.lineup_service._object_key_from_value`` but is
    inlined so the migration stays valid even if that helper later changes.
    """
    seen = 0
    while value[:4].lower() == "http" and seen < 5:
        parts = urlsplit(value)
        if not parts.scheme or not parts.netloc:
            break
        # URL path is "/<bucket>/<key...>" — drop the leading bucket segment.
        path = parts.path.lstrip("/")
        _, _, key = path.partition("/")
        value = unquote(key or path)
        seen += 1
    return value


def upgrade() -> None:
    bind = op.get_bind()
    lineup = sa.table(
        "lineup",
        sa.column("id", sa.String),
        sa.column("stand_screenshot_url", sa.String),
        sa.column("aim_screenshot_url", sa.String),
    )

    rows = bind.execute(
        sa.select(
            lineup.c.id,
            lineup.c.stand_screenshot_url,
            lineup.c.aim_screenshot_url,
        ).where(
            sa.or_(
                lineup.c.stand_screenshot_url.like("http%"),
                lineup.c.aim_screenshot_url.like("http%"),
            )
        )
    ).fetchall()

    for row in rows:
        updates = {}
        if row.stand_screenshot_url and row.stand_screenshot_url[:4].lower() == "http":
            updates["stand_screenshot_url"] = _object_key_from_value(
                row.stand_screenshot_url
            )
        if row.aim_screenshot_url and row.aim_screenshot_url[:4].lower() == "http":
            updates["aim_screenshot_url"] = _object_key_from_value(
                row.aim_screenshot_url
            )
        if updates:
            bind.execute(
                sa.update(lineup).where(lineup.c.id == row.id).values(**updates)
            )


def downgrade() -> None:
    # Intentionally a no-op — see module docstring.
    pass
