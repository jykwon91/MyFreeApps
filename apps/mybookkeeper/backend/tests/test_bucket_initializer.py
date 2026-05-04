"""Tests for `services/storage/bucket_initializer.py`.

The initializer runs at FastAPI startup. It MUST raise on any failure
so the deploy healthcheck catches misconfigured or unreachable MinIO
immediately. Silent degradation here was the source of PR #201–#204.
"""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch

from app.core.storage import StorageNotConfiguredError
from app.services.storage.bucket_initializer import ensure_bucket


class TestEnsureBucket:
    def test_calls_ensure_bucket_when_configured(self) -> None:
        storage = MagicMock()
        storage.bucket = "test-bucket"
        with patch(
            "app.services.storage.bucket_initializer.get_storage",
            return_value=storage,
        ):
            ensure_bucket()
        storage.ensure_bucket.assert_called_once()

    def test_propagates_get_storage_misconfig(self) -> None:
        with patch(
            "app.services.storage.bucket_initializer.get_storage",
            side_effect=StorageNotConfiguredError("MINIO_ENDPOINT unset"),
        ):
            with pytest.raises(StorageNotConfiguredError):
                ensure_bucket()

    def test_propagates_bucket_runtime_error(self) -> None:
        storage = MagicMock()
        storage.bucket = "test-bucket"
        storage.ensure_bucket.side_effect = RuntimeError("MinIO unreachable")
        with patch(
            "app.services.storage.bucket_initializer.get_storage",
            return_value=storage,
        ):
            with pytest.raises(RuntimeError, match="MinIO unreachable"):
                ensure_bucket()

    def test_is_idempotent(self) -> None:
        storage = MagicMock()
        storage.bucket = "test-bucket"
        with patch(
            "app.services.storage.bucket_initializer.get_storage",
            return_value=storage,
        ):
            ensure_bucket()
            ensure_bucket()
        assert storage.ensure_bucket.call_count == 2
