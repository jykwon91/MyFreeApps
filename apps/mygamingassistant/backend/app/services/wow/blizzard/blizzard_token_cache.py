"""One client-credentials token shared by every request until shortly before it expires."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable

from app.services.wow.blizzard.blizzard_token import BlizzardToken

# Ask for a new token this long before Blizzard's expiry.
_REFRESH_MARGIN_SECONDS = 300


class BlizzardTokenCache:
    def __init__(self) -> None:
        self._value: str | None = None
        self._expires_at = 0.0
        self._lock = asyncio.Lock()

    async def get(self, fetch: Callable[[], Awaitable[BlizzardToken]]) -> str:
        """The cached token, or a new one from ``fetch`` — one fetch however many callers wait."""
        async with self._lock:
            if self._value is None or time.monotonic() >= self._expires_at:
                token = await fetch()
                self._value = token.value
                self._expires_at = time.monotonic() + max(token.expires_in - _REFRESH_MARGIN_SECONDS, 0)
            return self._value

    def clear(self) -> None:
        """Forget the token (Blizzard refused it, or a test starts clean)."""
        self._value = None
        self._expires_at = 0.0
