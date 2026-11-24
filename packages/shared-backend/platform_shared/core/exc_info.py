"""The ``(type, exception, traceback)`` triple ``sys.exc_info()`` returns
while an exception is being handled."""
from __future__ import annotations

from types import TracebackType

ExcInfo = tuple[type[BaseException], BaseException, TracebackType | None]
