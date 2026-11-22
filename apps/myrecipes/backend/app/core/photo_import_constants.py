"""Limits for ``POST /recipes/extract`` beyond the byte cap in settings."""
from __future__ import annotations

from typing import Final

# The most pixels a recipe photo may declare. A small, highly compressed file can
# claim huge dimensions and decode into gigabytes, so the header is checked first.
# 80 million covers the 48-64 MP photos phone cameras take at full resolution
# (larger ones are over the byte cap anyway). It sits below Pillow's own warning
# threshold (about 89 million), so this cap, not Pillow's, decides what's refused.
MAX_PHOTO_PIXELS: Final = 80_000_000
