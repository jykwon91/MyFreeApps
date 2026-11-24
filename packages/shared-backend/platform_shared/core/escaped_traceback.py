"""Format an exception for a log line with its own text escaped.

``logging.Formatter`` appends the traceback after the message. The stack
frames come from source files, but an exception's message and notes often
carry request data (``ValueError(f"bad vendor {name!r}")``), so a CR/LF there
could forge a log record. This escapes, for every exception in the chain and
in any exception group, its message and notes (and a SyntaxError's message,
file name and source line), then lets ``traceback`` lay the result out as it
would anyway.
"""
from __future__ import annotations

import traceback
from collections.abc import Callable, Sequence

from platform_shared.core.exc_info import ExcInfo

_NOTES_REPR_FAILED = "<__notes__ repr() failed>"
_NOTE_STR_FAILED = "<note str() failed>"


def _note_text(note: object) -> str:
    try:
        return str(note)
    except Exception:  # noqa: BLE001 - as traceback prints it
        return _NOTE_STR_FAILED


def _escaped_notes(notes: object, escape: Callable[[str], str]) -> list[str]:
    """Each note escaped onto one line. ``traceback`` splits a note on its
    newlines, which would let a forged line pass as the note's own."""
    if isinstance(notes, Sequence) and not isinstance(notes, (str, bytes)):
        return [escape(_note_text(note)) for note in notes]
    try:
        text = repr(notes)
    except Exception:  # noqa: BLE001 - as traceback prints it
        text = _NOTES_REPR_FAILED
    return [escape(text)]


def _escape_node(te: traceback.TracebackException, escape: Callable[[str], str]) -> None:
    # ``_str`` holds the exception's str(); TracebackException has no public
    # way to set it. test_escaped_traceback fails if the attribute goes away.
    te._str = escape(te._str)  # noqa: SLF001
    if te.__notes__ is not None:
        te.__notes__ = _escaped_notes(te.__notes__, escape)
    # Set only for a SyntaxError, whose layout prints these instead of _str.
    # The source line's own line ending is traceback's to strip; a control
    # character before the error moves the caret a few columns.
    for name in ("msg", "text", "filename"):
        value = getattr(te, name, None)
        if isinstance(value, str):
            ending = value[len(value.rstrip("\r\n")):] if name == "text" else ""
            setattr(te, name, escape(value[: len(value) - len(ending)]) + ending)


def format_exception_escaped(exc_info: ExcInfo, escape: Callable[[str], str]) -> str:
    """The traceback ``logging.Formatter.formatException`` would write, with
    ``escape`` applied to each exception's text. No trailing newline, like
    ``formatException``."""
    root = traceback.TracebackException(*exc_info)
    seen: set[int] = set()
    pending: list[traceback.TracebackException | None] = [root]
    while pending:
        te = pending.pop()
        if te is None or id(te) in seen:
            continue
        seen.add(id(te))
        _escape_node(te, escape)
        pending += [te.__cause__, te.__context__, *(te.exceptions or ())]
    return "".join(root.format()).rstrip("\n")
