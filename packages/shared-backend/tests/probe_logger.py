"""A logger whose records reach Sentry the way an app's do."""

from __future__ import annotations

import io
import logging
from collections.abc import Iterator
from contextlib import contextmanager


@contextmanager
def probe_logger(name: str) -> Iterator[logging.Logger]:
    """``name``'s logger at INFO with a handler of its own, not propagating, then reset.

    The handler matters: the CRLF filter (``install_crlf_safe_logging``) runs on
    handlers, and Sentry's logging integration reads the record after them.
    """
    logger = logging.getLogger(name)
    handler = logging.StreamHandler(io.StringIO())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    try:
        yield logger
    finally:
        logger.removeHandler(handler)
        logger.setLevel(logging.NOTSET)
        logger.propagate = True
