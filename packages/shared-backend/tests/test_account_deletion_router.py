"""The shared ``DELETE /users/me`` route locks the user row, then captures, prepares, deletes and erases in order."""
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

    async def lock_by_id(_db: Any, user_id: Any, *, user_model: Any) -> None:
        calls.append(f"lock:{user_id == user.id}")

    async def prepare_deletion(_db: Any, _user: Any) -> Any:
        calls.append("prepare")
        return lambda: calls.append("after_commit")

    async def delete_account(_db: Any, _user: Any) -> None:
        calls.append("delete")

    async def capture_deletion_scope(_db: Any, _user: Any) -> Any:
        calls.append("capture")
        return "scope"

    async def erase_audit_history(_db: Any, _user: Any, scope: Any) -> None:
        calls.append(f"erase:{scope}")

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
        patch("platform_shared.services.account_deletion.user_repo.lock_by_id", lock_by_id),
        patch("platform_shared.services.account_deletion.delete_account", delete_account),
        patch("platform_shared.services.account_deletion.capture_deletion_scope", capture_deletion_scope),
        patch("platform_shared.services.account_deletion.erase_audit_history", erase_audit_history),
        patch("platform_shared.auth.released_current_user.release_connection", AsyncMock()),
    ):
        response = TestClient(app).request(
            "DELETE", "/users/me", json={"password": "pw", "confirm_email": "a@example.com"},
        )

    assert response.status_code == 204
    assert calls == ["lock:True", "capture", "prepare", "delete", "erase:scope", "after_commit"]
