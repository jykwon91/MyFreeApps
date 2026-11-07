"""How every published WoW image is stored."""
from __future__ import annotations

from typing import Final

CONTENT_TYPE: Final = "image/webp"
# A key holds one build's bytes for ever, so browsers and caches may keep it for a year.
CACHE_CONTROL: Final = "public, max-age=31536000, immutable"
