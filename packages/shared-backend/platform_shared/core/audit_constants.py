"""Constants for :mod:`platform_shared.core.audit`."""
from __future__ import annotations

from typing import Final

# Written to ``audit_logs.old_value`` / ``new_value`` in place of a sensitive
# column's value. Data migrations that redact rows written before a column was
# masked use the same literal.
SENSITIVE_VALUE_MASK: Final = "***"
