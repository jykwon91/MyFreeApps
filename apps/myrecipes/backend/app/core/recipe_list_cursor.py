"""Where the next page of ``GET /recipes`` starts: the sort key of the last row a page held.

The list is ordered ``updated_at DESC, id DESC``, so the next page is every row
sorting strictly after ``(updated_at, id)``. Paging by that key instead of by an
offset means a recipe moved to the top (a tweak, a restore) or deleted between
page loads never shifts the rows behind it, so none is skipped or repeated.

On the wire the cursor is opaque to clients: base64url JSON with no padding.
It is not signed: a hand-made cursor that decodes only moves where the page
starts, and every filter (tenant scope, soft-delete, search) still applies.
"""
from __future__ import annotations

import base64
import json
import uuid
from dataclasses import dataclass
from datetime import datetime

from app.core.invalid_recipe_cursor_error import InvalidRecipeCursorError
from app.core.recipe_list_constants import MAX_RECIPE_CURSOR_LENGTH

_UPDATED_AT_KEY = "u"
_ID_KEY = "i"
_INVALID_CURSOR = "Invalid cursor"


@dataclass(frozen=True)
class RecipeListCursor:
    updated_at: datetime
    id: uuid.UUID

    def encode(self) -> str:
        payload = json.dumps(
            {_UPDATED_AT_KEY: self.updated_at.isoformat(), _ID_KEY: str(self.id)},
            separators=(",", ":"),
        )
        return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")

    @classmethod
    def decode(cls, token: str) -> RecipeListCursor:
        """Parse a cursor from ``encode``; anything else raises ``InvalidRecipeCursorError``."""
        if len(token) > MAX_RECIPE_CURSOR_LENGTH:
            raise InvalidRecipeCursorError(_INVALID_CURSOR)
        try:
            raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
            payload = json.loads(raw)
            updated_at = datetime.fromisoformat(payload[_UPDATED_AT_KEY])
            recipe_id = uuid.UUID(payload[_ID_KEY])
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            raise InvalidRecipeCursorError(_INVALID_CURSOR) from exc
        if updated_at.tzinfo is None:
            raise InvalidRecipeCursorError(_INVALID_CURSOR)
        return cls(updated_at=updated_at, id=recipe_id)
