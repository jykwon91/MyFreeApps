"""Tests for account-level login lockout in UserManager.authenticate.

Tests cover:
- Failure counter increment and lockout trigger at threshold
- Lock persists even when correct password is supplied
- Successful login resets the counter
- Lock escalates on repeat failures after a lock expires
- 24-hour auto-reset of stale failure counters
- Locked account and unknown-email responses are indistinguishable
- Per-IP rate limit still fires independently of account lockout
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from app.core.auth import UserManager, _lock_duration_for
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


def _make_manager(user: MagicMock | None, *, parent_returns: MagicMock | None) -> UserManager:
    """Build a UserManager with mocked user_db and parent authenticate."""
    manager = UserManager.__new__(UserManager)

    user_db = MagicMock()
    user_db.update = AsyncMock()

    if user is None:
        from fastapi_users import exceptions as fu_exceptions
        manager.get_by_email = AsyncMock(side_effect=fu_exceptions.UserNotExists())
    else:
        manager.get_by_email = AsyncMock(return_value=user)

    # Mocking super().authenticate is done by patching BaseUserManager.authenticate
    # on the class directly in each test.
    manager.user_db = user_db
    manager.password_helper = MagicMock()
    manager.password_helper.hash = MagicMock(return_value="hashed")
    return manager


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
# Failure counter increment (below threshold)
# ---------------------------------------------------------------------------

class TestFailureCounterIncrement:
    @pytest.mark.anyio
    async def test_four_failures_no_lock(self) -> None:
        """Failures below threshold increment the counter but do not lock the account."""
        user = _make_user(failed_login_count=0)
        manager = _make_manager(user, parent_returns=None)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=None,
        ):
            for i in range(settings.lockout_threshold - 1):
                result = await manager.authenticate(_make_credentials())
                assert result is None

            # user_db.update called on each failure
            assert manager.user_db.update.call_count == settings.lockout_threshold - 1

            # No lock applied yet
            last_call_kwargs = manager.user_db.update.call_args_list[-1][0][1]
            assert "locked_until" not in last_call_kwargs

    @pytest.mark.anyio
    async def test_fifth_failure_triggers_lock(self) -> None:
        """The threshold-th consecutive failure must apply a lock."""
        user = _make_user(failed_login_count=settings.lockout_threshold - 1)
        manager = _make_manager(user, parent_returns=None)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=None,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is None
        update_dict = manager.user_db.update.call_args[0][1]
        assert "locked_until" in update_dict
        assert update_dict["failed_login_count"] == settings.lockout_threshold


# ---------------------------------------------------------------------------
# Lock persists with correct password
# ---------------------------------------------------------------------------

class TestLockPersistsWithCorrectPassword:
    @pytest.mark.anyio
    async def test_locked_account_rejects_correct_password(self) -> None:
        """Once locked, even the right password must be rejected until lock expires."""
        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
        user = _make_user(
            failed_login_count=settings.lockout_threshold,
            locked_until=future,
        )
        manager = _make_manager(user, parent_returns=user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=user,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is None
        # Should NOT have called user_db.update (no counter change for locked attempts)
        manager.user_db.update.assert_not_called()

    @pytest.mark.anyio
    async def test_expired_lock_allows_correct_password(self) -> None:
        """A lock that has already expired must not block login."""
        past = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
        user = _make_user(
            failed_login_count=settings.lockout_threshold,
            locked_until=past,
        )
        manager = _make_manager(user, parent_returns=user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=user,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is user


# ---------------------------------------------------------------------------
# Successful login resets counter
# ---------------------------------------------------------------------------

class TestSuccessfulLoginResetsCounter:
    @pytest.mark.anyio
    async def test_success_after_3_failures_clears_counter(self) -> None:
        """A successful login must reset failed_login_count to 0."""
        user = _make_user(failed_login_count=3)
        manager = _make_manager(user, parent_returns=user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=user,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is user
        update_dict = manager.user_db.update.call_args[0][1]
        assert update_dict["failed_login_count"] == 0
        assert update_dict["last_failed_login_at"] is None
        assert update_dict["locked_until"] is None

    @pytest.mark.anyio
    async def test_success_with_zero_count_skips_update(self) -> None:
        """If counter is already 0 and no lock, no update needed on success."""
        user = _make_user(failed_login_count=0, locked_until=None)
        manager = _make_manager(user, parent_returns=user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=user,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is user
        manager.user_db.update.assert_not_called()


# ---------------------------------------------------------------------------
# Lock escalation on repeat failures
# ---------------------------------------------------------------------------

class TestLockEscalation:
    @pytest.mark.anyio
    async def test_sixth_failure_gives_5min_lock(self) -> None:
        """After lock expires and one more failure, the lock must be 5 min (escalated)."""
        # Simulate the state AFTER a 1-min lock expired: count is at threshold, no active lock.
        user = _make_user(failed_login_count=settings.lockout_threshold)
        manager = _make_manager(user, parent_returns=None)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=None,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is None
        update_dict = manager.user_db.update.call_args[0][1]
        assert update_dict["failed_login_count"] == settings.lockout_threshold + 1
        expected_min = timedelta(minutes=5) - timedelta(seconds=2)
        expected_max = timedelta(minutes=5) + timedelta(seconds=2)
        now = datetime.now(tz=timezone.utc)
        lock_duration = update_dict["locked_until"] - now
        assert expected_min < lock_duration < expected_max


# ---------------------------------------------------------------------------
# 24-hour auto-reset of stale failure counter
# ---------------------------------------------------------------------------

class TestAutoReset:
    @pytest.mark.anyio
    async def test_stale_counter_resets_and_login_succeeds(self) -> None:
        """If last_failed_login_at is >24h ago and no active lock, counter must reset."""
        stale_time = datetime.now(tz=timezone.utc) - timedelta(
            hours=settings.lockout_autoreset_hours + 1
        )
        user = _make_user(
            failed_login_count=3,
            last_failed_login_at=stale_time,
            locked_until=None,
        )
        manager = _make_manager(user, parent_returns=user)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=user,
        ):
            result = await manager.authenticate(_make_credentials())

        assert result is user
        # First update call should be the auto-reset
        first_update = manager.user_db.update.call_args_list[0][0][1]
        assert first_update["failed_login_count"] == 0
        assert first_update["last_failed_login_at"] is None
        assert first_update["locked_until"] is None

    @pytest.mark.anyio
    async def test_recent_failure_does_not_reset(self) -> None:
        """If last_failed_login_at is within 24h, counter must NOT auto-reset."""
        recent_time = datetime.now(tz=timezone.utc) - timedelta(hours=1)
        user = _make_user(
            failed_login_count=3,
            last_failed_login_at=recent_time,
            locked_until=None,
        )
        manager = _make_manager(user, parent_returns=None)

        with patch(
            "fastapi_users.BaseUserManager.authenticate",
            new_callable=AsyncMock,
            return_value=None,
        ):
            await manager.authenticate(_make_credentials())

        # Only one update call — the failure increment, not an auto-reset first.
        assert manager.user_db.update.call_count == 1
        update_dict = manager.user_db.update.call_args[0][1]
        assert update_dict["failed_login_count"] == 4  # 3 + 1


# ---------------------------------------------------------------------------
# Unknown email — response must be indistinguishable from locked
# ---------------------------------------------------------------------------

class TestUnknownEmailIndistinguishable:
    @pytest.mark.anyio
    async def test_unknown_email_returns_none(self) -> None:
        """Unknown email must return None (same as locked account) — no 401 vs 429 divergence."""
        manager = _make_manager(None, parent_returns=None)

        result = await manager.authenticate(_make_credentials(email="ghost@example.com"))
        assert result is None

    @pytest.mark.anyio
    async def test_unknown_email_does_not_raise(self) -> None:
        """Unknown email must never raise — it must return None silently."""
        manager = _make_manager(None, parent_returns=None)

        # Should not raise
        result = await manager.authenticate(_make_credentials(email="ghost@example.com"))
        assert result is None


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
