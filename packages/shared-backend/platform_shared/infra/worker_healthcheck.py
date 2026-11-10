"""Validate + normalize an app.yaml worker ``healthcheck`` at render time.

A malformed healthcheck would otherwise render into docker-compose.yml and
only fail on the VPS (compose rejects it, or the deploy waits forever on a
check that can never pass).

Shape::

    healthcheck:
      test: ["CMD", "python", "-m", "app.workers.x_healthcheck"]  # required
      interval: 15s       # optional, duration string
      timeout: 5s         # optional, duration string
      start_period: 60s   # optional, duration string
      retries: 3          # optional, positive int
"""
from __future__ import annotations

import re
from typing import Any

_TEST_FORMS = ("CMD", "CMD-SHELL")
_DURATION = re.compile(r"^\d+(ms|s|m|h)$")
_DURATION_KEYS = ("interval", "timeout", "start_period")
_DEFAULTS: dict[str, Any] = {
    "interval": "15s",
    "timeout": "5s",
    "start_period": "60s",
    "retries": 3,
}
_ALLOWED_KEYS = {"test", "retries", *_DURATION_KEYS}


def normalize_worker_healthcheck(worker_name: str, raw: object) -> dict[str, Any]:
    """Return the healthcheck with defaults filled in, or raise ValueError."""
    where = f"worker {worker_name!r} healthcheck"
    if not isinstance(raw, dict):
        raise ValueError(f"{where} must be a mapping with a `test` list, got {type(raw).__name__}")
    unknown = set(raw) - _ALLOWED_KEYS
    if unknown:
        raise ValueError(f"{where} has unknown keys {sorted(unknown)}; allowed: {sorted(_ALLOWED_KEYS)}")

    test = raw.get("test")
    if (
        not isinstance(test, list)
        or len(test) < 2
        or not all(isinstance(part, str) and part for part in test)
        or test[0] not in _TEST_FORMS
    ):
        raise ValueError(
            f"{where} `test` must be a list of non-empty strings starting with "
            f"{' or '.join(_TEST_FORMS)} followed by the command, got {test!r}",
        )

    normalized: dict[str, Any] = {**_DEFAULTS, **raw}
    for key in _DURATION_KEYS:
        value = normalized[key]
        if not isinstance(value, str) or not _DURATION.match(value):
            raise ValueError(f"{where} `{key}` must be a duration like '15s', got {value!r}")
    retries = normalized["retries"]
    if not isinstance(retries, int) or isinstance(retries, bool) or retries < 1:
        raise ValueError(f"{where} `retries` must be a positive integer, got {retries!r}")
    return normalized
