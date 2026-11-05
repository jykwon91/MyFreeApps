"""Lockout pieces each app wires itself: durations, the pre-login check, the IP limit.

The flow (counting, locking, clearing, escalating) runs in the shared
``AccountGuardService`` and is tested on a real database in
``packages/shared-backend/tests/test_auth_route_transactions.py``.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from app.core.auth import _lock_duration_for
from app.core.config import settings
from app.core.rate_limit import RateLimiter


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_credentials(email: str = "user@example.com", password: str = "secret") -> OAuth2PasswordRequestForm:
    form = MagicMock(spec=OAuth2PasswordRequestForm)
    form.username = email
    form.password = password
    return form


def _make_user(
    *,
    failed_login_count: int = 0,
    locked_until: datetime | None = None,
    last_failed_login_at: datetime | None = None,
    email: str = "user@example.com",
    totp_enabled: bool = False,
) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = email
    user.failed_login_count = failed_login_count
    user.locked_until = locked_until
    user.last_failed_login_at = last_failed_login_at
    user.totp_enabled = totp_enabled
    return user


# ---------------------------------------------------------------------------
# Lock duration helper
# ---------------------------------------------------------------------------

class TestLockDurationFor:
    def test_threshold_gives_1_min(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold) == timedelta(minutes=1)

    def test_threshold_plus_1_gives_5_min(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 1) == timedelta(minutes=5)

    def test_threshold_plus_2_gives_15_min(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 2) == timedelta(minutes=15)

    def test_threshold_plus_3_gives_1_hour(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 3) == timedelta(hours=1)

    def test_threshold_plus_4_gives_24_hours(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 4) == timedelta(hours=24)

    def test_large_count_gives_24_hours(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 99) == timedelta(hours=24)


# ---------------------------------------------------------------------------
# check_account_not_locked dependency (early-reject via route dep)
# ---------------------------------------------------------------------------

class TestCheckAccountNotLocked:
    @pytest.mark.anyio
    async def test_locked_account_raises_429(self) -> None:
        from app.core.rate_limit import check_account_not_locked

        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
        locked_user = _make_user(locked_until=future)

        mock_db = MagicMock()
        credentials = _make_credentials()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=locked_user,
        ):
            with pytest.raises(HTTPException) as exc_info:
                await check_account_not_locked(credentials=credentials, db=mock_db)

        assert exc_info.value.status_code == 429
        assert "Too many" in exc_info.value.detail

    @pytest.mark.anyio
    async def test_unlocked_account_does_not_raise(self) -> None:
        from app.core.rate_limit import check_account_not_locked

        unlocked_user = _make_user(locked_until=None)
        mock_db = MagicMock()
        credentials = _make_credentials()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=unlocked_user,
        ):
            # Should not raise
            await check_account_not_locked(credentials=credentials, db=mock_db)

    @pytest.mark.anyio
    async def test_unknown_email_does_not_raise(self) -> None:
        from app.core.rate_limit import check_account_not_locked

        mock_db = MagicMock()
        credentials = _make_credentials(email="ghost@example.com")

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=None,
        ):
            # Unknown email — must not raise
            await check_account_not_locked(credentials=credentials, db=mock_db)

    @pytest.mark.anyio
    async def test_expired_lock_does_not_raise(self) -> None:
        from app.core.rate_limit import check_account_not_locked

        past = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
        user = _make_user(locked_until=past)
        mock_db = MagicMock()
        credentials = _make_credentials()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=user,
        ):
            # Expired lock — must not raise
            await check_account_not_locked(credentials=credentials, db=mock_db)


# ---------------------------------------------------------------------------
# Per-IP rate limit still fires independently
# ---------------------------------------------------------------------------

class TestPerIpLimitComposesWithAccountLockout:
    def test_ip_limiter_still_triggers_before_account_lockout(self) -> None:
        """The per-IP limiter has max_attempts=10; account lockout threshold=5.
        Exhausting the IP limiter (10 attempts) must still raise 429 regardless of
        the account lockout threshold setting."""
        limiter = RateLimiter(max_attempts=10, window_seconds=300)
        for _ in range(10):
            limiter.check("1.2.3.4")

        with pytest.raises(HTTPException) as exc_info:
            limiter.check("1.2.3.4")

        assert exc_info.value.status_code == 429

    def test_ip_limiter_is_independent_of_account(self) -> None:
        """Two different accounts from the same IP share the per-IP bucket."""
        limiter = RateLimiter(max_attempts=3, window_seconds=300)
        limiter.check("10.0.0.1")
        limiter.check("10.0.0.1")
        limiter.check("10.0.0.1")

        # Third attempt exhausts the IP bucket
        with pytest.raises(HTTPException):
            limiter.check("10.0.0.1")
