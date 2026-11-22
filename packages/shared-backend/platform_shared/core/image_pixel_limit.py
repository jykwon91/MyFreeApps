"""Refuse an image whose dimensions would decode into an outsized bitmap."""
from __future__ import annotations

from platform_shared.core.image_pixel_limit_error import ImagePixelLimitError


def ensure_within_pixel_limit(width: int, height: int, max_pixels: int) -> None:
    """Raise when ``width * height`` is over ``max_pixels``.

    Call it with the size an image header declares (Pillow's ``Image.open`` reads
    only the header), before decoding. A small, highly compressed file can
    declare huge dimensions, and decoding it would allocate every pixel.

    Raises:
        ImagePixelLimitError: the image has more than ``max_pixels`` pixels.
    """
    if width * height > max_pixels:
        raise ImagePixelLimitError(max_pixels)
