"""Tests for `services/storage/bucket_initializer.py`.

The initializer runs at FastAPI startup. It must:
- Be idempotent (calling twice is fine).
- Never raise — startup must succeed even if MinIO is misconfigured or
  unreachable.
- Skip silently when storage is not configured (local dev).
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services.storage.bucket_initializer import ensure_bucket


class TestEnsureBucket:
    def test_no_op_when_storage_not_configured(self) -> None:
        with patch(
            "app.services.storage.bucket_initializer.get_storage",
            return_value=None,
        ):
            # Must not raise.
            ensure_bucket()

    def test_calls_ensure_bucket_when_configured(self) -> None:
        storage = MagicMock()
        storage.bucket = "test-bucket"
        with patch(
            "app.services.storage.bucket_initializer.get_storage",
            return_value=storage,
        ):
            ensure_bucket()
        storage.ensure_bucket.assert_called_once()

    def test_swallows_storage_errors(self) -> None:
        storage = MagicMock()
        storage.bucket = "test-bucket"
        storage.ensure_bucket.side_effect = RuntimeError("MinIO unreachable")
        with patch(
            "app.services.storage.bucket_initializer.get_storage",
            return_value=storage,
        ):
            # Must not raise — startup must succeed.
            ensure_bucket()

    def test_swallows_get_storage_exceptions(self) -> None:
        with patch(
            "app.services.storage.bucket_initializer.get_storage",
            side_effect=RuntimeError("config exploded"),
        ):
            ensure_bucket()  # must not raise

    def test_is_idempotent(self) -> None:
        storage = MagicMock()
        storage.bucket = "test-bucket"
        with patch(
            "app.services.storage.bucket_initializer.get_storage",
            return_value=storage,
        ):
            ensure_bucket()
            ensure_bucket()
        # Each call to ensure_bucket dispatches a single make_bucket attempt;
        # safe to call repeatedly.
        assert storage.ensure_bucket.call_count == 2
