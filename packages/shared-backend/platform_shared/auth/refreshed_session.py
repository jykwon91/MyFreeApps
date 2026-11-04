"""What signing in or refreshing hands back."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RefreshedSession:
    user: Any
    session: Any
    # The only copy of the secret. It's never stored or logged.
    refresh_token: str
