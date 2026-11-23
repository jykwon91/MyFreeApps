"""Unit tests for platform_shared.core.image_pixel_limit."""
from __future__ import annotations

import pytest

from platform_shared.core.image_pixel_limit import ensure_within_pixel_limit
from platform_shared.core.image_pixel_limit_error import ImagePixelLimitError


def test_at_limit_passes() -> None:
    ensure_within_pixel_limit(100, 100, max_pixels=10_000)


def test_over_limit_raises_naming_the_cap() -> None:
    with pytest.raises(ImagePixelLimitError, match="exceed 10000 pixels") as info:
        ensure_within_pixel_limit(101, 100, max_pixels=10_000)
    assert info.value.max_pixels == 10_000


def test_is_a_value_error() -> None:
    assert issubclass(ImagePixelLimitError, ValueError)
