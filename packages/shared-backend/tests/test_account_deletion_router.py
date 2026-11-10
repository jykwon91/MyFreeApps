"""The shared ``DELETE /users/me`` route locks the user row before preparing the delete."""
import contextlib
import uuid
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from platform_shared.api.account_deletion_router import build_account_deletion_router
from platform_shared.services.guard_outcome import GuardOutcome


class _User(SimpleNamespace):
    pass


def test_user_row_is_locked_before_prepare_deletion_runs() -> None:
    user = _User(id=uuid.uuid4(), email="a@example.com", totp_enabled=False, hashed_password="h")
    calls: list[str] = []

    db = AsyncMock()
    db.get = AsyncMock(side_effect=lambda *a, **k: calls.append(f"lock:{k.get('with_for_update')}"))

    async def prepare_deletion(_db: Any, _user: Any) -> Any:
        calls.append("prepare")
        return lambda: calls.append("after_commit")

    async def delete_account(_db: Any, _user: Any) -> None:
        calls.append("delete")

    @contextlib.asynccontextmanager
    async def unit_of_work() -> AsyncIterator[Any]:
        yield db

    async def current_active_user() -> _User:
        return user

    async def get_db() -> AsyncIterator[Any]:
        yield MagicMock()

    manager = MagicMock()
    manager.account_guard.begin_attempt = AsyncMock(return_value=GuardOutcome.ALLOWED)
    manager.account_guard.record_password_attempt = AsyncMock(return_value=GuardOutcome.ALLOWED)
    manager.password_helper.verify_and_update = MagicMock(return_value=(True, None))

    async def get_user_manager() -> Any:
        return manager

    router = build_account_deletion_router(
        current_active_user=current_active_user,
        get_user_manager=get_user_manager,
        get_db_dependency=get_db,
        verify_totp_step_up=AsyncMock(return_value=True),
        unit_of_work_factory=unit_of_work,
        prepare_deletion=prepare_deletion,
    )
    app = FastAPI()
    app.include_router(router)

    with (
        patch("platform_shared.api.account_deletion_router.delete_account", delete_account),
        patch("platform_shared.auth.released_current_user.release_connection", AsyncMock()),
    ):
        response = TestClient(app).request(
            "DELETE", "/users/me", json={"password": "pw", "confirm_email": "a@example.com"},
        )

    assert response.status_code == 204
    assert calls == ["lock:True", "prepare", "delete", "after_commit"]
