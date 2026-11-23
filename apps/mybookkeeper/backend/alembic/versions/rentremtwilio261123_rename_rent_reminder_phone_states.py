"""Name rent reminder text states for a provider, not a phone

Rent reminder texts now go out through Twilio instead of being relayed by
the operator's Android phone (httpSMS), so the states and error codes that
named the phone are renamed:

- status ``sent_to_phone`` -> ``sent_to_provider``
- error ``no_phone_confirmation`` -> ``no_sms_confirmation``
- error ``phone_failed: <detail>`` -> ``sms_failed: <detail>``
- error ``expired`` (the phone gave up) -> ``sms_failed: expired``

The status check constraint and the watchdog's partial index (which lists the
pending statuses) are rebuilt around the new name. Existing rows are rewritten
in the same transaction, so no row ever holds a value the constraint refuses.
The detail after ``phone_failed:`` is kept as it was, so history still says
what the phone reported.

Revision ID: rentremtwilio261123
Revises: holdings261124
Create Date: 2026-11-23 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "rentremtwilio261123"
down_revision: str | None = "holdings261124"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "rent_reminder_sends"
_STATUS_CHECK = "chk_rent_reminder_send_status"
_PENDING_INDEX = "ix_rent_reminder_sends_pending"
_MAX_ERROR_CODE_LENGTH = 120

_NEW_STATUSES = "('queued', 'sent_to_provider', 'sent', 'delivered', 'failed')"
_OLD_STATUSES = "('queued', 'sent_to_phone', 'sent', 'delivered', 'failed')"
_NEW_PENDING = "('queued', 'sent_to_provider')"
_OLD_PENDING = "('queued', 'sent_to_phone')"


def _rebuild(*, statuses: str, pending: str) -> None:
    op.create_check_constraint(_STATUS_CHECK, _TABLE, f"status IN {statuses}")
    op.create_index(
        _PENDING_INDEX,
        _TABLE,
        ["created_at"],
        postgresql_where=sa.text(f"status IN {pending}"),
    )


def _drop() -> None:
    op.drop_index(_PENDING_INDEX, table_name=_TABLE)
    op.drop_constraint(_STATUS_CHECK, _TABLE, type_="check")


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    _drop()
    op.execute(f"UPDATE {_TABLE} SET status = 'sent_to_provider' WHERE status = 'sent_to_phone'")
    op.execute(
        f"UPDATE {_TABLE} SET error_code = 'no_sms_confirmation' "
        "WHERE error_code = 'no_phone_confirmation'"
    )
    op.execute(
        f"UPDATE {_TABLE} SET error_code = 'sms_failed: ' || substr(error_code, 15) "
        "WHERE error_code LIKE 'phone\\_failed: %' ESCAPE '\\'"
    )
    op.execute(
        f"UPDATE {_TABLE} SET error_code = 'sms_failed: expired' "
        "WHERE channel = 'sms' AND error_code = 'expired'"
    )
    _rebuild(statuses=_NEW_STATUSES, pending=_NEW_PENDING)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    _drop()
    op.execute(f"UPDATE {_TABLE} SET status = 'sent_to_phone' WHERE status = 'sent_to_provider'")
    op.execute(
        f"UPDATE {_TABLE} SET error_code = 'no_phone_confirmation' "
        "WHERE error_code = 'no_sms_confirmation'"
    )
    op.execute(
        f"UPDATE {_TABLE} SET error_code = 'expired' "
        "WHERE channel = 'sms' AND error_code = 'sms_failed: expired'"
    )
    op.execute(
        f"UPDATE {_TABLE} SET error_code = "
        f"substr('phone_failed: ' || substr(error_code, 13), 1, {_MAX_ERROR_CODE_LENGTH}) "
        "WHERE error_code LIKE 'sms\\_failed: %' ESCAPE '\\'"
    )
    _rebuild(statuses=_OLD_STATUSES, pending=_OLD_PENDING)
