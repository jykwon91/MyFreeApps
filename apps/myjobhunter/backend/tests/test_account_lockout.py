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

from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL

from app.core.auth import _lock_duration_for
from app.core.config import settings
from app.core.rate_limit import RateLimiter, check_account_not_locked


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_credentials(
    email: str = "user@example.com", password: str = "secret",
) -> OAuth2PasswordRequestForm:
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
    user.is_verified = True
    user.is_active = True
    return user


# ---------------------------------------------------------------------------
# Lock duration schedule (must stay byte-identical to MBK production)
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

    def test_large_count_clamps_to_24_hours(self) -> None:
        assert _lock_duration_for(settings.lockout_threshold + 99) == timedelta(hours=24)


# ---------------------------------------------------------------------------
# check_account_not_locked dependency (early reject at route level)
# ---------------------------------------------------------------------------


class TestCheckAccountNotLocked:
    @pytest.mark.asyncio
    async def test_locked_account_returns_429_with_generic_body(self) -> None:
        future = datetime.now(tz=timezone.utc) + timedelta(minutes=5)
        locked_user = _make_user(locked_until=future)

        mock_db = MagicMock()
        credentials = _make_credentials()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=locked_user,
        ):
            with pytest.raises(HTTPException) as exc:
                await check_account_not_locked(credentials=credentials, db=mock_db)

        assert exc.value.status_code == 429
        assert exc.value.detail == RATE_LIMIT_GENERIC_DETAIL

    @pytest.mark.asyncio
    async def test_unlocked_account_does_not_raise(self) -> None:
        unlocked_user = _make_user(locked_until=None)
        mock_db = MagicMock()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=unlocked_user,
        ):
            await check_account_not_locked(credentials=_make_credentials(), db=mock_db)

    @pytest.mark.asyncio
    async def test_unknown_email_does_not_raise(self) -> None:
        mock_db = MagicMock()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=None,
        ):
            await check_account_not_locked(
                credentials=_make_credentials(email="ghost@example.com"),
                db=mock_db,
            )

    @pytest.mark.asyncio
    async def test_expired_lock_does_not_raise(self) -> None:
        past = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
        user = _make_user(locked_until=past)
        mock_db = MagicMock()

        with patch(
            "app.core.rate_limit.get_user_by_email",
            new_callable=AsyncMock,
            return_value=user,
        ):
            await check_account_not_locked(credentials=_make_credentials(), db=mock_db)


# ---------------------------------------------------------------------------
# Per-IP limiter still fires independently of account lockout
# ---------------------------------------------------------------------------


class TestPerIpLimitComposesWithAccountLockout:
    def test_ip_limiter_threshold_is_independent(self) -> None:
        """Per-IP limit (10/5min) is independent of account-lockout threshold (5)."""
        limiter = RateLimiter(
            max_attempts=settings.login_rate_limit_threshold,
            window_seconds=settings.login_rate_limit_window_seconds,
        )
        for _ in range(settings.login_rate_limit_threshold):
            limiter.check("1.2.3.4")

        with pytest.raises(HTTPException) as exc:
            limiter.check("1.2.3.4")

        assert exc.value.status_code == 429
        assert exc.value.detail == RATE_LIMIT_GENERIC_DETAIL
