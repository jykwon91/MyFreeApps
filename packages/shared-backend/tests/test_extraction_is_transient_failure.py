"""``is_transient_failure``: retry-later vs final, for any exception."""
from __future__ import annotations

import pytest

from platform_shared.extraction import (
    AnthropicFailureKind,
    ExtractionError,
    ExtractionParseError,
    is_transient_failure,
)


@pytest.mark.parametrize(
    ("kind", "expected"),
    [
        (AnthropicFailureKind.RATE_LIMITED, True),
        (AnthropicFailureKind.UPSTREAM, True),
        (AnthropicFailureKind.MISCONFIGURED, False),
        (AnthropicFailureKind.INPUT_REJECTED, False),
    ],
)
def test_extraction_errors_answer_by_kind(kind: AnthropicFailureKind, expected: bool) -> None:
    assert is_transient_failure(ExtractionError("x", kind=kind)) is expected
    # The caller's extras never override the Claude classification.
    assert is_transient_failure(
        ExtractionError("x", kind=kind), extra_transient=(RuntimeError,),
    ) is expected


def test_unreadable_reply_is_final() -> None:
    assert is_transient_failure(ExtractionParseError("bad json")) is False


def test_other_errors_are_final_unless_the_caller_names_them() -> None:
    assert is_transient_failure(TimeoutError()) is False
    assert is_transient_failure(TimeoutError(), extra_transient=(TimeoutError,)) is True
    assert is_transient_failure(
        ConnectionResetError(), extra_transient=(TimeoutError, ConnectionError),
    ) is True
    assert is_transient_failure(
        ValueError("x"), extra_transient=(TimeoutError, ConnectionError),
    ) is False
