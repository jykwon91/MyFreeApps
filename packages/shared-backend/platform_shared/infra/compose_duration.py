"""Docker Compose duration strings (``15s``, ``1m``) accepted in app.yaml."""
from __future__ import annotations

import re

_DURATION = re.compile(r"^\d+(ms|s|m|h)$")


def is_compose_duration(value: object) -> bool:
    """Whether ``value`` is a single-unit duration string compose accepts."""
    return isinstance(value, str) and bool(_DURATION.match(value))
