"""A code stays in the window for up to 90 seconds but works only once."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pyotp
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from platform_shared.auth.totp_replay_guard import TotpReplayGuardMixin
from platform_shared.repositories.user_repo import _locked_select
from platform_shared.services import totp_service
from platform_shared.services.totp_service import generate_secret, matching_time_step

STEP_SECONDS = 30


class _Base(DeclarativeBase):
    pass


class _User(TotpReplayGuardMixin, _Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)


def _totp(secret: str) -> pyotp.TOTP:
    return pyotp.TOTP(secret, digest=hashlib.sha256)


_NOW = datetime(2026, 11, 3, 12, 0, 15, tzinfo=timezone.utc)


def _current_step() -> int:
    return int(_NOW.timestamp()) // STEP_SECONDS


@pytest.fixture(autouse=True)
def _frozen_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without this, a step boundary between two lines makes these tests flaky."""
    clock = MagicMock(wraps=datetime)
    clock.now.return_value = _NOW
    monkeypatch.setattr(totp_service, "datetime", clock)


@pytest.mark.parametrize("offset", [-1, 0, 1])
def test_a_code_in_the_window_returns_its_step(offset: int) -> None:
    secret = generate_secret()
    step = _current_step() + offset

    assert matching_time_step(secret, _totp(secret).generate_otp(step)) == step


def test_a_code_outside_the_window_or_empty_is_refused() -> None:
    secret = generate_secret()

    assert matching_time_step(secret, _totp(secret).generate_otp(_current_step() - 5)) is None
    assert matching_time_step(secret, "") is None


def test_the_spent_step_and_older_ones_are_refused() -> None:
    secret = generate_secret()
    step = _current_step()
    code = _totp(secret).generate_otp(step)

    assert matching_time_step(secret, code, after_step=step) is None
    assert matching_time_step(secret, code, after_step=step + 1) is None
    assert matching_time_step(secret, code, after_step=step - 1) == step


def test_a_code_for_a_newer_step_still_works_after_one_is_spent() -> None:
    secret = generate_secret()
    step = _current_step()

    assert matching_time_step(
        secret, _totp(secret).generate_otp(step + 1), after_step=step,
    ) == step + 1


def test_sha1_enrollments_are_checked_with_sha1() -> None:
    secret = generate_secret()
    step = _current_step()
    code = pyotp.TOTP(secret).generate_otp(step)

    assert matching_time_step(secret, code, algorithm="sha1") == step


def test_the_row_is_locked_and_reread() -> None:
    """Without a fresh read, a session that already loaded the user sees a stale marker."""
    statement = _locked_select(_User)

    assert "FOR UPDATE OF users" in str(statement.compile(dialect=postgresql.dialect()))
    assert statement.get_execution_options()["populate_existing"] is True
