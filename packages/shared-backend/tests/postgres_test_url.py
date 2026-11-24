"""The database the Postgres-backed tests run against."""

from __future__ import annotations

import os
from typing import Final

import pytest

POSTGRES_URL_ENV: Final = "SHARED_BACKEND_TEST_POSTGRES_URL"


def postgres_test_url() -> str:
    """The URL in ``SHARED_BACKEND_TEST_POSTGRES_URL``; the test is skipped without one.

    CI sets it, so there a missing URL fails the test instead: Postgres-backed
    tests can't quietly stop running.
    """
    url = os.environ.get(POSTGRES_URL_ENV)
    if url:
        return url
    if os.environ.get("CI"):
        pytest.fail(f"{POSTGRES_URL_ENV} isn't set")
    pytest.skip(f"{POSTGRES_URL_ENV} isn't set")
