"""Stand-ins for the database in mocked resume-refinement unit tests.

Claude calls hand the session's connection back first and re-read the row
afterwards (``session_claude_window``). These let a mocked ``db`` do both.
"""
from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

_REREAD = "app.services.resume_refinement.session_claude_window.session_repo.get_by_id_for_user"


def mock_db() -> MagicMock:
    """A mocked session with nothing waiting to be written."""
    db = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.new = db.dirty = db.deleted = ()
    return db


def rereads(session: Any) -> Any:
    """Patch the after-Claude re-read to find ``session`` unchanged."""
    return patch(_REREAD, new=AsyncMock(return_value=session))
