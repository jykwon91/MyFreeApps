"""Whether the rows a write recorded are visible, asked after its commit raised."""
from __future__ import annotations

from collections.abc import Awaitable, Callable

RowsPresent = Callable[[], Awaitable[bool]]
