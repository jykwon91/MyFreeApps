"""One streamed Blizzard answer: its headers and the rows of one top-level array."""
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class JsonArrayStream:
    headers: httpx.Headers
    # The array's object rows, parsed one at a time as the bytes arrive; non-object rows are skipped.
    rows: AsyncIterator[dict[str, Any]]
    # True when the server returned 304 Not Modified; rows is empty.
    not_modified: bool = False
