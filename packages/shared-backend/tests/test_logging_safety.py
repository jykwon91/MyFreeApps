"""Tests for the CRLF-safe logging primitive.

Log injection is the single largest class of CodeQL finding in this monorepo
(120+ ``py/log-injection`` alerts across five apps): request-supplied values are
interpolated into log lines, and a newline in one of them lets an attacker forge
a whole extra record that an operator reading ``docker logs`` cannot tell from a
real one. The defence lives at the handler boundary rather than at the call
sites, so these tests pin the boundary behaviour.
"""
from __future__ import annotations

import io
import logging

import pytest

from platform_shared.core.logging_safety import (
    CRLFSafeLogFilter,
    escape_log_controls,
    install_crlf_safe_logging,
)


@pytest.fixture()
def captured():
    """A logger with one stream handler, isolated from the root config."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
    logger = logging.getLogger("platform_shared.tests.logging_safety")
    logger.handlers = [handler]
    logger.propagate = False
    logger.setLevel(logging.DEBUG)
    try:
        yield logger, stream, handler
    finally:
        logger.handlers = []


class TestEscapeLogControls:
    def test_newline_and_carriage_return_become_printable(self) -> None:
        assert escape_log_controls("a\nb\rc") == "a\\nb\\rc"

    def test_ansi_escape_is_neutralised(self) -> None:
        # A raw ESC lets a value repaint or clear the reader's terminal.
        assert escape_log_controls("\x1b[2Jwiped") == "\\x1b[2Jwiped"

    def test_other_c0_controls_become_hex(self) -> None:
        assert escape_log_controls("\x00\x07") == "\\x00\\x07"

    def test_del_is_escaped(self) -> None:
        assert escape_log_controls("\x7f") == "\\x7f"

    def test_tab_is_preserved(self) -> None:
        # Tab is common in legitimate payloads and cannot forge a record break.
        assert escape_log_controls("a\tb") == "a\tb"

    def test_ordinary_text_is_untouched(self) -> None:
        assert escape_log_controls("vendor=ACME count=3") == "vendor=ACME count=3"

    def test_idempotent(self) -> None:
        once = escape_log_controls("a\nb")
        assert escape_log_controls(once) == once


class TestFilterAtHandlerBoundary:
    def test_forged_record_is_flattened_to_one_line(self, captured) -> None:
        logger, stream, _ = captured
        install_crlf_safe_logging(logger)
        # The classic attack: a field value that closes the real record and
        # opens a convincing fake one.
        logger.info("reassign vendor=%s", "ACME\nINFO app ADMIN_DB wiped_everything")
        out = stream.getvalue()
        assert out.count("\n") == 1, out  # only the handler's own terminator
        assert "ACME\\nINFO app ADMIN_DB wiped_everything" in out

    def test_escaping_happens_after_interpolation(self, captured) -> None:
        # A literal ``%s`` in the format string is not itself the payload; the
        # newline arrives via the argument, so escaping must run post-format.
        logger, stream, _ = captured
        install_crlf_safe_logging(logger)
        logger.warning("a=%s b=%s", "x\ny", "z")
        assert "a=x\\ny b=z" in stream.getvalue()

    def test_clean_message_is_unchanged(self, captured) -> None:
        logger, stream, _ = captured
        install_crlf_safe_logging(logger)
        logger.info("vendor=%s count=%d", "ACME", 3)
        assert "INFO vendor=ACME count=3" in stream.getvalue()

    def test_exception_traceback_keeps_its_newlines(self, captured) -> None:
        # Tracebacks are interpreter-generated and multi-line by nature; only
        # the interpolated message is sanitised.
        logger, stream, _ = captured
        install_crlf_safe_logging(logger)
        try:
            raise ValueError("boom")
        except ValueError:
            logger.exception("failed for vendor=%s", "ACME\nfake")
        out = stream.getvalue()
        assert "vendor=ACME\\nfake" in out
        assert "Traceback (most recent call last):" in out
        assert out.count("\n") > 1

    def test_install_is_idempotent(self, captured) -> None:
        logger, stream, handler = captured
        install_crlf_safe_logging(logger)
        install_crlf_safe_logging(logger)
        assert sum(isinstance(f, CRLFSafeLogFilter) for f in handler.filters) == 1
        # And a second pass must not double-escape the backslash.
        logger.info("v=%s", "a\nb")
        assert "v=a\\nb" in stream.getvalue()

    def test_two_handlers_do_not_double_escape(self, captured) -> None:
        logger, stream, _ = captured
        second = io.StringIO()
        extra = logging.StreamHandler(second)
        extra.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(extra)
        install_crlf_safe_logging(logger)
        logger.info("v=%s", "a\nb")
        assert "v=a\\nb" in stream.getvalue()
        assert second.getvalue().strip() == "v=a\\nb"

    def test_malformed_format_string_still_emits(self, captured) -> None:
        # A broken format string is the logging framework's error to report --
        # sanitisation must never swallow the record.
        logger, _stream, handler = captured
        install_crlf_safe_logging(logger)
        record = logging.LogRecord(
            name="t", level=logging.INFO, pathname=__file__, lineno=1,
            msg="%s %s", args=("only-one",), exc_info=None,
        )
        assert all(f.filter(record) for f in handler.filters)


def test_root_install_covers_basic_config_handler() -> None:
    """The boot-time shape: ``basicConfig`` then ``install_crlf_safe_logging``."""
    root = logging.getLogger()
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(message)s"))
    original = root.handlers
    root.handlers = [handler]
    try:
        install_crlf_safe_logging()
        logging.getLogger("app.some.child").warning("v=%s", "a\nb")
        assert stream.getvalue().strip() == "v=a\\nb"
    finally:
        root.handlers = original
