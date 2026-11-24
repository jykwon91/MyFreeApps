"""The logger, stream and handler the CRLF logging tests write through."""

from __future__ import annotations

import io
import logging
from typing import NamedTuple


class CapturedLogger(NamedTuple):
    """A logger whose one handler writes to ``stream``."""

    logger: logging.Logger
    stream: io.StringIO
    handler: logging.StreamHandler[io.StringIO]
