"""``describe_model_output`` gives length, stop reason and hash, never the text."""
import hashlib

from platform_shared.core.model_output_log import MODEL_OUTPUT_HASH_CHARS, describe_model_output


def test_describes_without_the_text() -> None:
    text = '{"name": "Jane Doe", "total": 1234.56'
    described = describe_model_output(text, stop_reason="max_tokens")
    digest = hashlib.sha256(text.encode()).hexdigest()[:MODEL_OUTPUT_HASH_CHARS]
    assert described == f"chars={len(text)} stop_reason=max_tokens sha256={digest}"
    assert "Jane" not in described and "1234" not in described


def test_missing_stop_reason_and_empty_text() -> None:
    assert describe_model_output("", stop_reason=None).startswith("chars=0 stop_reason=unknown sha256=")


def test_same_text_same_hash() -> None:
    assert describe_model_output("x", stop_reason="end_turn") == describe_model_output("x", stop_reason="end_turn")
