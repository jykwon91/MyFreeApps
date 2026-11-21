"""The recipe list cursor round-trips the sort key exactly and rejects anything it didn't encode."""
from __future__ import annotations

import base64
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.invalid_recipe_cursor_error import InvalidRecipeCursorError
from app.core.recipe_list_cursor import RecipeListCursor


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def test_round_trips_microseconds_and_the_id() -> None:
    cursor = RecipeListCursor(
        updated_at=datetime(2026, 11, 20, 9, 30, 15, 123456, tzinfo=timezone.utc),
        id=uuid.uuid4(),
    )
    assert RecipeListCursor.decode(cursor.encode()) == cursor


def test_keeps_a_non_utc_offset_as_the_same_instant() -> None:
    cursor = RecipeListCursor(
        updated_at=datetime(2026, 1, 1, 8, tzinfo=timezone(timedelta(hours=-6))), id=uuid.uuid4(),
    )
    decoded = RecipeListCursor.decode(cursor.encode())
    assert decoded.updated_at == cursor.updated_at


def test_encodes_to_url_safe_text_without_padding() -> None:
    token = RecipeListCursor(updated_at=datetime.now(timezone.utc), id=uuid.uuid4()).encode()
    assert "=" not in token and "+" not in token and "/" not in token


@pytest.mark.parametrize(
    "token",
    [
        "",
        "not a cursor",
        _b64(b"not json"),
        _b64(b"[1, 2]"),
        _b64(b'"a string"'),
        _b64(b'{"u": "2026-01-01T00:00:00+00:00"}'),
        _b64(b'{"i": "%s"}' % str(uuid.uuid4()).encode()),
        _b64(b'{"u": "yesterday", "i": "%s"}' % str(uuid.uuid4()).encode()),
        _b64(b'{"u": "2026-01-01T00:00:00+00:00", "i": "not-a-uuid"}'),
        _b64(b'{"u": 5, "i": 5}'),
        _b64(b'{"u": "2026-01-01T00:00:00", "i": "%s"}' % str(uuid.uuid4()).encode()),
        _b64(b"\xff\xfe"),
        "A" * 500,
    ],
)
def test_rejects_a_token_it_did_not_encode(token: str) -> None:
    with pytest.raises(InvalidRecipeCursorError):
        RecipeListCursor.decode(token)
