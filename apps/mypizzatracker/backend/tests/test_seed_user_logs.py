"""Seeding the operator logs the user id, never the operator's email address."""
import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.user import seed_user_service

_EMAIL = "operator@example.com"


@asynccontextmanager
async def _uow() -> AsyncIterator[MagicMock]:
    yield MagicMock()


@pytest.mark.parametrize("exists", [True, False])
async def test_seed_logs_the_user_id(caplog: pytest.LogCaptureFixture, exists: bool) -> None:
    user = MagicMock(id=uuid.uuid4())
    with (
        patch.object(seed_user_service, "unit_of_work", _uow),
        patch.object(seed_user_service.user_repo, "get_by_email", AsyncMock(return_value=user if exists else None)),
        patch.object(seed_user_service.user_repo, "create_seed_user", AsyncMock(return_value=user)),
        caplog.at_level(logging.INFO, logger=seed_user_service.__name__),
    ):
        await seed_user_service.seed_operator_user(_EMAIL, "$2b$12$hash")
    assert _EMAIL not in caplog.text
    assert str(user.id) in caplog.text
