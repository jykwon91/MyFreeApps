"""Unit tests for platform_shared.core.aware_datetime."""
from datetime import datetime, timedelta, timezone

import pytest

from platform_shared.core.aware_datetime import require_aware_utc


def test_converts_other_zone_to_utc() -> None:
    plus_two = timezone(timedelta(hours=2))
    result = require_aware_utc(datetime(2026, 6, 16, 2, 0, tzinfo=plus_two), name="now")
    assert result == datetime(2026, 6, 16, 0, 0, tzinfo=timezone.utc)
    assert result.tzinfo == timezone.utc


def test_utc_passes_through() -> None:
    value = datetime(2026, 6, 16, 0, 15, tzinfo=timezone.utc)
    assert require_aware_utc(value, name="now") == value


def test_naive_raises_naming_the_value() -> None:
    with pytest.raises(ValueError, match="last_run must be timezone-aware"):
        require_aware_utc(datetime(2026, 6, 16, 0, 15), name="last_run")
