"""The lookup-code column on rent reminder sends: the model's rules and the migration's.

The suite builds its schema from the models with ``create_all``, so the
model's CHECKs are exercised on SQLite here. The migration is run against a
mocked ``op`` and held to the model's exact column, CHECK SQL and index, so the
two can't drift apart. (Checked by hand on Postgres 18: upgrade, downgrade and
upgrade again, with the reply lookup using the index.)
"""
from __future__ import annotations

import datetime as _dt
import importlib.util
import uuid
from decimal import Decimal
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import CheckConstraint
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rent.rent_reminder_send import RentReminderSend

MIGRATION_FILE = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "rentremphonehash261123_add_rent_reminder_recipient_phone_hash.py"
)
_TABLE = RentReminderSend.__table__
_INDEX = "ix_rent_reminder_sends_recipient_phone_hash"
_CODE = "0123456789abcdef" * 4


def _send(*, channel: str, status: str, code: str | None) -> RentReminderSend:
    return RentReminderSend(
        id=uuid.uuid4(),
        plan_id=uuid.uuid4(),
        applicant_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        due_date=_dt.date(2026, 11, 22),
        channel=channel,
        status=status,
        amount=Decimal("1500.00"),
        message_body="Hi Sonu, reminder: rent of $1,500 is due on Sunday, Nov 22.",
        recipient_phone_hash=code,
    )


class TestModelRules:
    @pytest.mark.parametrize(
        ("channel", "status", "code"),
        [("sms", "delivered", _CODE), ("sms", "failed", None), ("email", "sent", None)],
        ids=["text_with_code", "text_without", "email_without"],
    )
    async def test_allowed(self, db: AsyncSession, channel: str, status: str, code: str | None) -> None:
        db.add(_send(channel=channel, status=status, code=code))
        await db.flush()

    @pytest.mark.parametrize(
        ("channel", "status", "code"),
        [("email", "sent", _CODE), ("sms", "delivered", _CODE[:-1]), ("sms", "delivered", _CODE + "0")],
        ids=["email_with_code", "code_too_short", "code_too_long"],
    )
    async def test_refused(self, db: AsyncSession, channel: str, status: str, code: str) -> None:
        db.add(_send(channel=channel, status=status, code=code))
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()


@pytest.fixture(scope="module")
def migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location(MIGRATION_FILE.stem, MIGRATION_FILE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(migration: ModuleType, step: str) -> MagicMock:
    """Run ``upgrade`` or ``downgrade`` against a mocked Postgres ``op``; return the mock."""
    op = MagicMock()
    op.get_bind.return_value.dialect.name = "postgresql"
    with patch.object(migration, "op", op):
        getattr(migration, step)()
    return op


def _model_checks() -> dict[str, str]:
    return {
        constraint.name: str(constraint.sqltext)
        for constraint in _TABLE.constraints
        if isinstance(constraint, CheckConstraint) and "phone_hash" in str(constraint.name)
    }


class TestMigration:
    def test_chains_after_the_twilio_state_rename(self, migration: ModuleType) -> None:
        assert (migration.revision, migration.down_revision) == (
            "rentremphonehash261123", "rentremtwilio261123",
        )

    def test_adds_the_models_column(self, migration: ModuleType) -> None:
        [call] = _run(migration, "upgrade").add_column.call_args_list
        table, column = call.args
        model_column = _TABLE.c.recipient_phone_hash
        assert table == _TABLE.name
        assert (column.name, column.type.length, column.nullable) == (
            model_column.name, model_column.type.length, True,
        )

    def test_adds_the_models_checks(self, migration: ModuleType) -> None:
        op = _run(migration, "upgrade")
        added = {call.args[0]: (call.args[1], call.args[2]) for call in op.create_check_constraint.call_args_list}
        assert len(_model_checks()) == 2
        assert added == {name: (_TABLE.name, sql) for name, sql in _model_checks().items()}

    def test_adds_the_models_partial_index(self, migration: ModuleType) -> None:
        [call] = _run(migration, "upgrade").create_index.call_args_list
        [model_index] = [index for index in _TABLE.indexes if index.name == _INDEX]
        assert call.args == (_INDEX, _TABLE.name, [column.name for column in model_index.columns])
        assert str(call.kwargs["postgresql_where"]) == str(model_index.dialect_options["postgresql"]["where"])

    @pytest.mark.parametrize("step", ["upgrade", "downgrade"])
    def test_waits_at_most_five_seconds_for_its_lock(self, migration: ModuleType, step: str) -> None:
        _run(migration, step).execute.assert_called_once_with("SET LOCAL lock_timeout = '5s'")

    def test_downgrade_removes_all_of_it(self, migration: ModuleType) -> None:
        op = _run(migration, "downgrade")
        op.drop_index.assert_called_once_with(_INDEX, table_name=_TABLE.name)
        assert sorted(call.args[0] for call in op.drop_constraint.call_args_list) == sorted(_model_checks())
        op.drop_column.assert_called_once_with(_TABLE.name, "recipient_phone_hash")
