"""CRLF-safe logging — a Tier-1 shared primitive against log injection.

Every app interpolates request-supplied values into log lines
(``logger.info("... vendor=%s", body.vendor)``). If such a value contains a
newline, the attacker controls where one log record visually ends and the
next begins: they can forge an entire fake line ("... user=admin
action=deleted") that an operator reading ``docker logs`` cannot distinguish
from a genuine one. ANSI escape sequences are the same class of problem — a
value carrying an ESC-bracket sequence can clear or repaint the reader's
terminal.

Rather than ask every call site to remember to sanitise (120+ call sites
across five apps, and every new one a fresh chance to forget), this module
neutralises the whole class **once**, at the handler boundary: the escaping
happens after %-interpolation and before formatting, so it covers every
logger in the process — app code, ``platform_shared``, and third-party
libraries alike — without touching a single call site.

What is escaped
===============
C0 control characters in the *interpolated message* — CR, LF, ESC, and the
rest of the 0x00-0x1f range plus DEL — are rewritten to their printable
backslash form. Horizontal tab is left alone: it is common in legitimate log
payloads and cannot forge a record boundary.

What is NOT escaped
===================
The formatter's own layout (timestamp, level, logger name) and the exception
traceback appended by ``Formatter.format``. Tracebacks are multi-line by
nature and are produced by the interpreter, not by user input. Only
``record.getMessage()`` is rewritten.

Usage
=====
Call once at boot, immediately after ``logging.basicConfig``::

    logging.basicConfig(level=logging.INFO, format=...)
    install_crlf_safe_logging()

Idempotent — calling it twice neither double-escapes nor double-installs.
"""
from __future__ import annotations

import logging

__all__ = [
    "CRLFSafeLogFilter",
    "escape_log_controls",
    "install_crlf_safe_logging",
]

# Spelled via chr() so no source-level escape sequence can be mis-read.
_BACKSLASH = chr(92)

# Control characters that get a mnemonic form; everything else in the C0
# range falls back to a hex escape.
_MNEMONICS = {
    0x0A: "n",
    0x0D: "r",
    0x09: "t",  # listed for completeness; tab is exempted below
}


def _build_translation_table() -> dict[int, str]:
    """Map every C0 control (bar tab) plus DEL to a printable escape."""
    table: dict[int, str] = {}
    for code in list(range(0x20)) + [0x7F]:
        if code == 0x09:  # tab — legitimate in payloads, cannot break a record
            continue
        mnemonic = _MNEMONICS.get(code)
        if mnemonic is not None:
            table[code] = _BACKSLASH + mnemonic
        else:
            table[code] = _BACKSLASH + "x" + format(code, "02x")
    return table


_CONTROL_TRANSLATION = _build_translation_table()


def escape_log_controls(message: str) -> str:
    """Return ``message`` with record-breaking control characters escaped.

    Pure and idempotent: the output contains no control characters, so
    re-applying it is a no-op.
    """
    return message.translate(_CONTROL_TRANSLATION)


class CRLFSafeLogFilter(logging.Filter):
    """Rewrite a record's interpolated message so it cannot break a line.

    Installed on handlers rather than loggers: a logger-level filter does not
    see records that propagate up from child loggers, which is exactly where
    app log calls originate.

    The record is mutated in place (``msg`` replaced with the escaped,
    fully-interpolated text and ``args`` cleared) so that *every* handler and
    the Sentry logging integration observe the sanitised form, not just the
    handler this filter happens to be attached to. Escaping is idempotent, so
    several handlers each running the filter is harmless.
    """

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        try:
            message = record.getMessage()
        except Exception:  # pragma: no cover - malformed %-args
            # A broken format string is the logging framework's problem to
            # report; never let sanitisation swallow the record.
            return True
        safe = escape_log_controls(message)
        if safe != message:
            record.msg = safe
            record.args = ()
        return True


def install_crlf_safe_logging(logger: logging.Logger | None = None) -> None:
    """Attach :class:`CRLFSafeLogFilter` to every handler on ``logger``.

    Defaults to the root logger, which is where ``logging.basicConfig``
    installs the process-wide handler that app loggers propagate to.

    Args:
        logger: Logger whose handlers get the filter. Defaults to root.
    """
    target = logger if logger is not None else logging.getLogger()
    for handler in target.handlers:
        if any(isinstance(f, CRLFSafeLogFilter) for f in handler.filters):
            continue
        handler.addFilter(CRLFSafeLogFilter())
