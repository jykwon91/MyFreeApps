"""Where the renderer gets a minimap tile's bytes: a FileDataID -> its BLP."""
from __future__ import annotations

from collections.abc import Callable

TileSource = Callable[[int], bytes]
