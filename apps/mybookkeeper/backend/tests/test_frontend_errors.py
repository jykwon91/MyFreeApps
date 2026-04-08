"""Tests for the frontend error logging endpoint."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.core.rate_limit import RateLimiter, frontend_error_limiter
from app.schemas.system.frontend_error import FrontendErrorCreate


class TestFrontendErrorSchema:
    def test_valid_full_payload(self) -> None:
        body = FrontendErrorCreate(
            message="TypeError: Cannot read property 'x' of undefined",
            stack="TypeError: Cannot read property...\n    at Foo.tsx:42",
            url="http://localhost:5173/transactions",
            component="TransactionTable",
        )
        assert body.message == "TypeError: Cannot read property 'x' of undefined"
        assert body.stack is not None
        assert body.url is not None
        assert body.component == "TransactionTable"

    def test_valid_minimal_payload(self) -> None:
        body = FrontendErrorCreate(message="Something went wrong")
        assert body.message == "Something went wrong"
        assert body.stack is None
        assert body.url is None
        assert body.component is None

    def test_message_required(self) -> None:
        with pytest.raises(Exception):
            FrontendErrorCreate()  # type: ignore[call-arg]


class TestFrontendErrorRateLimiter:
    def test_frontend_error_limiter_exists(self) -> None:
        assert isinstance(frontend_error_limiter, RateLimiter)

    def test_frontend_error_limiter_config(self) -> None:
        assert frontend_error_limiter._config.max_attempts == 50
        assert frontend_error_limiter._config.window_seconds == 3600

    def test_allows_50_then_blocks(self) -> None:
        limiter = RateLimiter(max_attempts=50, window_seconds=3600)
        for _ in range(50):
            limiter.check("test-user")
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            limiter.check("test-user")
        assert exc_info.value.status_code == 429
