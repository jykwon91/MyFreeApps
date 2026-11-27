"""Record a lookup code for the number each rent reminder text went to

Tenants' replies to reminder texts are emailed to the landlord who texted them.
To tell whose reply it is without decrypting anyone's phone number, each text
now stores ``recipient_phone_hash``: a keyed HMAC-SHA256 of the E.164 number it
went to (``app.core.security.phone_lookup_hash``), set when the text is claimed
and on every retry.

Existing rows keep NULL: the key lives in the app, not the database, so they
can't be filled in here. Replies to texts sent before this deploy therefore go
unmatched (and unforwarded), never misrouted.

Two CHECKs keep the column honest (texts only; always the code's 64 characters),
and a partial index covers the reply lookup: the recent texts to one number.

Revision ID: rentremphonehash261123
Revises: rentremtwilio261123
Create Date: 2026-11-23 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "rentremphonehash261123"
down_revision: str | None = "rentremtwilio261123"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "rent_reminder_sends"
_COLUMN = "recipient_phone_hash"
_HASH_LENGTH = 64
_SMS_ONLY_CHECK = "chk_rent_reminder_send_phone_hash_sms_only"
_LENGTH_CHECK = "chk_rent_reminder_send_phone_hash_length"
_INDEX = "ix_rent_reminder_sends_recipient_phone_hash"


def _set_lock_timeout() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")


def upgrade() -> None:
    _set_lock_timeout()
    op.add_column(_TABLE, sa.Column(_COLUMN, sa.String(_HASH_LENGTH), nullable=True))
    op.create_check_constraint(
        _SMS_ONLY_CHECK, _TABLE, f"channel = 'sms' OR {_COLUMN} IS NULL",
    )
    op.create_check_constraint(
        _LENGTH_CHECK, _TABLE, f"{_COLUMN} IS NULL OR length({_COLUMN}) = {_HASH_LENGTH}",
    )
    op.create_index(
        _INDEX,
        _TABLE,
        [_COLUMN, "created_at"],
        postgresql_where=sa.text(f"{_COLUMN} IS NOT NULL"),
    )


def downgrade() -> None:
    _set_lock_timeout()
    op.drop_index(_INDEX, table_name=_TABLE)
    op.drop_constraint(_LENGTH_CHECK, _TABLE, type_="check")
    op.drop_constraint(_SMS_ONLY_CHECK, _TABLE, type_="check")
    op.drop_column(_TABLE, _COLUMN)
