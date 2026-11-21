"""The admin storage check asks the storage client whether its bucket exists."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from minio.error import S3Error

from app.api import admin
from app.core.storage import get_storage

pytestmark = pytest.mark.asyncio


async def test_reports_the_bucket_reachable() -> None:
    get_storage().bucket_exists.return_value = True

    report = await admin.storage_health(user=MagicMock())

    assert report["bucket_reachable"] is True
    assert report["bucket_error"] is None
    get_storage().bucket_exists.assert_called_once_with()


async def test_reports_why_the_bucket_is_unreachable() -> None:
    get_storage().bucket_exists.side_effect = S3Error(None, "AccessDenied", "denied", "", "", "")

    report = await admin.storage_health(user=MagicMock())

    assert report["bucket_reachable"] is False
    assert "AccessDenied" in report["bucket_error"]
