"""An unparseable Claude reply is logged by length, stop reason and hash, never its text.

The reply carries the resume or posting the model read: names, contact details, employers.
"""
import logging
from unittest.mock import MagicMock

import pytest

from app.services.extraction import claude_service


def _block(block_type: str, text: str = "") -> MagicMock:
    block = MagicMock()
    block.type = block_type
    block.text = text
    return block


def _message(text: str, stop_reason: str) -> MagicMock:
    message = MagicMock()
    message.content = [_block("text", text)]
    message.stop_reason = stop_reason
    return message


def test_unparseable_reply_is_logged_without_its_text(caplog: pytest.LogCaptureFixture) -> None:
    reply = '{"name": "Jane Doe", "email": "jane@example.com", "work_history": ['
    with caplog.at_level(logging.ERROR, logger=claude_service.__name__), pytest.raises(ValueError):
        claude_service._parse_json_response(_message(reply, "max_tokens"))

    assert "Jane Doe" not in caplog.text and "jane@example.com" not in caplog.text
    assert f"chars={len(reply)} stop_reason=max_tokens sha256=" in caplog.text


def test_a_non_text_first_block_does_not_hide_the_reply() -> None:
    message = _message('{"ok": true}', "end_turn")
    message.content = [_block("tool_use"), *message.content]
    assert claude_service._parse_json_response(message) == {"ok": True}


def test_a_reply_with_no_text_block_is_a_parse_error() -> None:
    message = _message("", "end_turn")
    message.content = [_block("tool_use")]
    with pytest.raises(ValueError, match="invalid JSON"):
        claude_service._parse_json_response(message)
