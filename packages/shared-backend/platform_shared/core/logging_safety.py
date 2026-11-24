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
Control characters in the *interpolated message* are rewritten to their
printable backslash form:

- the C0 range (0x00-0x1f: CR, LF, ESC, ...) and DEL;
- the C1 range (0x80-0x9f). U+0085 (NEL) is a line break to Python's
  ``str.splitlines`` and many log viewers, and U+009B (CSI) starts a terminal
  control sequence on its own, like ESC-bracket;
- U+2028 and U+2029, the Unicode line and paragraph separators, which log
  viewers and JSON-in-JavaScript tooling treat as line breaks.

Horizontal tab is left alone: it is common in legitimate log payloads and
cannot forge a record boundary.

The same characters are escaped in the text of a logged exception: each
``Type: message`` line and its notes, for every exception in the chain
(see ``escaped_traceback``). An exception's message often carries request
data.

What is NOT escaped
===================
The formatter's own layout (timestamp, level, logger name), and the
traceback's stack frames, which keep their line breaks: they come from source
files, not from user input.

What is NOT changed
===================
The record itself. A protected handler writes an escaped copy, so the
record keeps its message template and arguments for whatever reads it
next, such as Sentry's logging integration.

Usage
=====
Call once at boot, immediately after ``logging.basicConfig``::

    logging.basicConfig(level=logging.INFO, format=...)
    install_crlf_safe_logging()

Only the handlers attached when it runs are protected, so call it again
after adding one. Idempotent — calling it twice neither double-escapes nor
double-installs.
"""
from __future__ import annotations

import copy
import logging

from platform_shared.core.escaped_traceback import format_exception_escaped

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

# LINE SEPARATOR and PARAGRAPH SEPARATOR: not controls, but line breaks.
_UNICODE_LINE_BREAKS = (0x2028, 0x2029)


def _build_translation_table() -> dict[int, str]:
    """Map every C0 control (bar tab), DEL, every C1 control, and the
    Unicode line and paragraph separators to a printable escape."""
    table: dict[int, str] = {}
    for code in [*range(0x20), 0x7F, *range(0x80, 0xA0)]:
        if code == 0x09:  # tab — legitimate in payloads, cannot break a record
            continue
        mnemonic = _MNEMONICS.get(code)
        if mnemonic is not None:
            table[code] = _BACKSLASH + mnemonic
        else:
            table[code] = _BACKSLASH + "x" + format(code, "02x")
    for code in _UNICODE_LINE_BREAKS:
        table[code] = _BACKSLASH + "u" + format(code, "04x")
    return table


_CONTROL_TRANSLATION = _build_translation_table()


def escape_log_controls(message: str) -> str:
    """Return ``message`` with record-breaking control characters escaped.

    Pure and idempotent: the output contains no control characters or line
    separators, so re-applying it is a no-op.
    """
    return message.translate(_CONTROL_TRANSLATION)


class CRLFSafeLogFilter(logging.Filter):
    """Escape the control characters in a record's message for one handler.

    Installed on handlers rather than loggers: a logger-level filter does not
    see records that propagate up from child loggers, which is exactly where
    app log calls originate.

    When the interpolated message holds a character ``escape_log_controls``
    rewrites, or the record carries an exception, this returns a copy of the
    record whose ``msg`` is the escaped text, whose ``args`` are empty, and
    whose ``exc_text`` is the traceback with each exception's text escaped
    (so a formatter's own ``formatException`` override isn't used). Since
    Python 3.12 a filter may return a replacement record, and
    ``logging.Handler.handle`` emits it in the record's place; a handler that
    overrides ``handle`` and emits the record it was given would write the
    original.

    The record itself is left as it was. Sentry's logging integration reads
    it after every handler has run, and sends its template and arguments: an
    event's ``logentry.message`` and ``params``, and a Sentry log's template
    and parameters. Escaping the record in place left Sentry only the
    formatted text. Sentry also sends the formatted text unescaped, as an
    event's ``logentry.formatted``, a breadcrumb's ``message`` and a Sentry
    log's body. Its events, breadcrumbs and logs are structured, so a
    control character can't split one.
    """

    def filter(self, record: logging.LogRecord) -> bool | logging.LogRecord:  # noqa: A003
        try:
            message = record.getMessage()
        except Exception:  # pragma: no cover - malformed %-args
            # A broken format string is the logging framework's problem to
            # report; never let sanitisation swallow the record.
            return True
        safe = escape_log_controls(message)
        exc_text = _escaped_exception_text(record)
        if safe == message and exc_text is None:
            return True
        escaped = copy.copy(record)
        escaped.msg = safe
        escaped.args = ()
        if exc_text is not None:
            # Formatter.format writes exc_text when it is set, instead of
            # formatting exc_info itself.
            escaped.exc_text = exc_text
        return escaped


def _escaped_exception_text(record: logging.LogRecord) -> str | None:
    """The record's traceback with each exception's text escaped, or None
    when it carries no exception.

    A filter that raises takes down the caller's ``logger.exception`` (3.12's
    ``Handler.handle`` doesn't catch it), so a traceback that can't be
    formatted becomes one escaped line instead.
    """
    if not record.exc_info or record.exc_info[1] is None:
        return None
    try:
        return format_exception_escaped(record.exc_info, escape_log_controls)
    except Exception:  # noqa: BLE001 - logging must not raise into the caller
        name = type(record.exc_info[1]).__name__
        return escape_log_controls(f"{name}: <traceback could not be formatted>")


def install_crlf_safe_logging(logger: logging.Logger | None = None) -> None:
    """Attach :class:`CRLFSafeLogFilter` to every handler on ``logger``.

    Defaults to the root logger, which is where ``logging.basicConfig``
    installs the process-wide handler that app loggers propagate to.

    Only the handlers attached now are protected. A handler added later
    writes control characters as they are until this runs again.

    Args:
        logger: Logger whose handlers get the filter. Defaults to root.
    """
    target = logger if logger is not None else logging.getLogger()
    for handler in target.handlers:
        if any(isinstance(f, CRLFSafeLogFilter) for f in handler.filters):
            continue
        handler.addFilter(CRLFSafeLogFilter())
