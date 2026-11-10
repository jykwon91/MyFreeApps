"""The columns ``GET /applications`` can sort on — the allowlist for ``?sort=``."""
from __future__ import annotations

from typing import Literal

ApplicationSortField = Literal["applied", "company", "role", "status", "location", "remote", "fit"]
