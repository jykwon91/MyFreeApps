"""Tests for ``format_exception_escaped``."""
from __future__ import annotations

import logging
import sys
import traceback

import pytest

from platform_shared.core.escaped_traceback import format_exception_escaped
from platform_shared.core.exc_info import ExcInfo
from platform_shared.core.logging_safety import escape_log_controls


def _caught(raiser: object) -> ExcInfo:
    try:
        raiser()  # type: ignore[operator]
    except BaseException:  # noqa: BLE001 - the test inspects whatever was raised
        exc_type, exc, tb = sys.exc_info()
        assert exc_type is not None and exc is not None
        return exc_type, exc, tb
    raise AssertionError("nothing was raised")


def _plain(exc_info: ExcInfo) -> str:
    return logging.Formatter().formatException(exc_info)


def _raise_simple() -> None:
    raise ValueError("boom")


def _raise_with_cause() -> None:
    try:
        raise KeyError("inner")
    except KeyError as exc:
        raise RuntimeError("outer") from exc


def _raise_with_context() -> None:
    try:
        raise KeyError("inner")
    except KeyError:
        raise RuntimeError("outer")  # noqa: B904 - the implicit context is the point


def _raise_from_none() -> None:
    try:
        raise KeyError("inner")
    except KeyError:
        raise RuntimeError("outer") from None


def _raise_with_note() -> None:
    exc = ValueError("boom")
    exc.add_note("while reading row 3")
    raise exc


@pytest.mark.parametrize(
    "raiser",
    [_raise_simple, _raise_with_cause, _raise_with_context, _raise_from_none, _raise_with_note],
)
def test_matches_the_formatter_when_nothing_needs_escaping(raiser: object) -> None:
    exc_info = _caught(raiser)
    assert format_exception_escaped(exc_info, escape_log_controls) == _plain(exc_info)


def test_the_message_is_escaped_and_the_frames_keep_their_lines() -> None:
    def _forge() -> None:
        raise ValueError("bad vendor ACME\n2026-01-01 INFO user=admin action=deleted")

    out = format_exception_escaped(_caught(_forge), escape_log_controls)
    assert out.startswith("Traceback (most recent call last):\n")
    assert "ValueError: bad vendor ACME\\n2026-01-01 INFO user=admin action=deleted" in out
    assert not any(line.startswith("2026-01-01") for line in out.splitlines())
    assert "_forge" in out


def test_notes_are_escaped() -> None:
    def _noted() -> None:
        exc = ValueError("boom")
        exc.add_note("row\nFAKE line")
        raise exc

    out = format_exception_escaped(_caught(_noted), escape_log_controls)
    assert out.endswith("ValueError: boom\nrow\\nFAKE line")


def test_every_exception_in_the_chain_is_escaped() -> None:
    def _chained() -> None:
        try:
            raise KeyError("cause\rFAKE")
        except KeyError as exc:
            raise RuntimeError("outer\u2028FAKE") from exc

    out = format_exception_escaped(_caught(_chained), escape_log_controls)
    assert "cause\\rFAKE" in out
    assert "outer\\u2028FAKE" in out
    assert "The above exception was the direct cause of the following exception:" in out


def test_an_exception_group_keeps_its_layout_with_each_sub_exception_escaped() -> None:
    def _group() -> None:
        raise ExceptionGroup("two failed", [ValueError("a\nFAKE"), TypeError("b")])

    out = format_exception_escaped(_caught(_group), escape_log_controls)
    assert "two failed (2 sub-exceptions)" in out
    assert "ValueError: a\\nFAKE" in out and "TypeError: b" in out
    assert not any(line.lstrip(" |").startswith("FAKE") for line in out.splitlines())


def test_a_wide_exception_group_is_capped_like_the_interpreter_caps_it() -> None:
    def _wide() -> None:
        raise ExceptionGroup("many", [ValueError(str(n)) for n in range(100)])

    exc_info = _caught(_wide)
    assert format_exception_escaped(exc_info, escape_log_controls) == _plain(exc_info)
    assert "and 85 more exceptions" in _plain(exc_info)


def test_a_syntax_error_keeps_its_layout_and_its_text_is_escaped() -> None:
    def _bad_source() -> None:
        compile("x = (1 +\n", "<user\nFAKE>", "exec")

    exc_info = _caught(_bad_source)
    out = format_exception_escaped(exc_info, escape_log_controls)
    assert 'File "<user\\nFAKE>"' in out
    assert out.splitlines()[-1].startswith("SyntaxError: ")
    assert "    x = (1 +" in out.splitlines()
    assert not any(line.startswith("FAKE") for line in out.splitlines())


def test_a_long_chain_does_not_exhaust_the_stack() -> None:
    def _long_chain() -> None:
        exc: BaseException = ValueError("0")
        for n in range(1, 3000):
            try:
                raise ValueError(str(n)) from exc
            except ValueError as raised:
                exc = raised
        raise exc

    exc_info = _caught(_long_chain)
    assert format_exception_escaped(exc_info, escape_log_controls) == _plain(exc_info)


def test_a_cycle_in_the_chain_is_formatted_once() -> None:
    def _cycle() -> None:
        first = ValueError("first")
        second = KeyError("second")
        first.__cause__ = second
        second.__cause__ = first
        raise first

    exc_info = _caught(_cycle)
    assert format_exception_escaped(exc_info, escape_log_controls) == _plain(exc_info)


class _BadRepr:
    def __repr__(self) -> str:
        raise RuntimeError("no repr")


class _BadStr(Exception):
    def __str__(self) -> str:
        raise RuntimeError("no str")


def test_notes_that_are_not_a_sequence_are_printed_by_repr() -> None:
    def _odd_notes() -> None:
        exc = ValueError("boom")
        exc.__notes__ = _BadRepr()  # type: ignore[assignment]
        raise exc

    exc_info = _caught(_odd_notes)
    out = format_exception_escaped(exc_info, escape_log_controls)
    assert out == _plain(exc_info)
    assert out.endswith("<__notes__ repr() failed>")


def test_an_exception_whose_str_raises_matches_the_formatter() -> None:
    def _bad() -> None:
        raise _BadStr()

    exc_info = _caught(_bad)
    assert format_exception_escaped(exc_info, escape_log_controls) == _plain(exc_info)


def test_an_exception_raised_without_a_traceback_has_no_header() -> None:
    exc = ValueError("never raised")
    out = format_exception_escaped((ValueError, exc, None), escape_log_controls)
    assert out == "ValueError: never raised"
    assert out == "".join(traceback.format_exception(exc)).rstrip("\n")
