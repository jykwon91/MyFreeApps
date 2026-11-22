"""The error :func:`platform_shared.core.image_pixel_limit.ensure_within_pixel_limit` raises."""
from __future__ import annotations


class ImagePixelLimitError(ValueError):
    """An image's dimensions exceed the caller's pixel cap (a decompression bomb guard)."""

    def __init__(self, max_pixels: int) -> None:
        self.max_pixels = max_pixels
        super().__init__(f"image dimensions exceed {max_pixels} pixels")
