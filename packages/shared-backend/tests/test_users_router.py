"""``build_users_router`` puts ``DELETE /users/{id}`` behind the strict gate.

Past the gate it runs the shared deletion with the app's ``prepare_deletion``;
``test_users_router_erasure.py`` drives that deletion for real.

The gate's own checks are covered in ``test_permissions.py``. These tests use the
real fastapi-users router, so they also fail if a library upgrade renames the
route being replaced.
"""
from __future__ import annotations

import contextlib
import uuid
from collections.abc import AsyncIterator, Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi_users import FastAPIUsers, exceptions, schemas
from fastapi_users.authentication import AuthenticationBackend, BearerTransport
from httpx import ASGITransport, AsyncClient

from platform_shared.api.users_router import build_users_router
from platform_shared.services.account_deletion import AccountDeletionBlockedError
from platform_shared.services.prepare_deletion import PrepareDeletion

_PLAIN_SUPERUSER_HEADERS = {"Authorization": "Bearer stolen-admin-token"}
_GATE_PASS_HEADERS = {**_PLAIN_SUPERUSER_HEADERS, "X-Test-Gate": "pass"}


class _Read(schemas.BaseUser[uuid.UUID]):
    pass


class _Update(schemas.CreateUpdateDictModel):
    pass


def _build(manager: MagicMock, prepare_deletion: PrepareDeletion | None = None) -> FastAPI:
    superuser = MagicMock(
        id=uuid.uuid4(), is_active=True, is_verified=True, is_superuser=True
    )
    strategy = MagicMock()
    strategy.read_token = AsyncMock(return_value=superuser)
    backend = AuthenticationBackend(
        name="test",
        transport=BearerTransport(tokenUrl="login"),
        get_strategy=lambda: strategy,
    )

    async def strict_gate(x_test_gate: str | None = Header(default=None)) -> None:
        if x_test_gate != "pass":
            raise HTTPException(status_code=401, headers={"X-Require-Step-Up": "totp"})

    app = FastAPI()
    app.include_router(
        build_users_router(
            fastapi_users=FastAPIUsers(lambda: manager, [backend]),
            user_read=_Read,
            user_update=_Update,
            current_strict_superuser=strict_gate,
            prepare_deletion=prepare_deletion,
        ),
        prefix="/users",
    )
    return app


def _manager() -> MagicMock:
    manager = MagicMock()
    manager.parse_id = MagicMock(side_effect=uuid.UUID)
    manager.get = AsyncMock(return_value=MagicMock(name="target"))
    return manager


@pytest.fixture()
def deletion() -> Iterator[AsyncMock]:
    """The shared deletion, with the route's own transaction on a stand-in session."""
    txn_db = MagicMock(name="txn_db")

    @contextlib.asynccontextmanager
    async def unit_of_work(_session: Any) -> AsyncIterator[Any]:
        yield txn_db

    delete = AsyncMock(return_value=None)
    with (
        patch("platform_shared.api.users_router.release_connection", AsyncMock()),
        patch("platform_shared.api.users_router.unit_of_work_on_same_database", unit_of_work),
        patch("platform_shared.api.users_router.delete_account_and_erase_history", delete),
    ):
        yield delete


async def _delete(app: FastAPI, user_id: str, headers: dict[str, str]) -> int:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        return (await client.delete(f"/users/{user_id}", headers=headers)).status_code


@pytest.mark.asyncio
async def test_a_superuser_token_alone_cannot_delete_a_user(deletion: AsyncMock) -> None:
    manager = _manager()
    status = await _delete(_build(manager), str(uuid.uuid4()), _PLAIN_SUPERUSER_HEADERS)
    assert status == 401
    deletion.assert_not_awaited()


@pytest.mark.asyncio
async def test_passing_the_gate_runs_the_shared_deletion_with_the_apps_hook(deletion: AsyncMock) -> None:
    manager = _manager()
    target_id = uuid.uuid4()
    prepare_deletion = AsyncMock()
    status = await _delete(_build(manager, prepare_deletion), str(target_id), _GATE_PASS_HEADERS)
    assert status == 204
    manager.get.assert_awaited_once_with(target_id)
    deletion.assert_awaited_once()
    _txn_db, user, hook = deletion.await_args.args
    assert user is manager.get.return_value
    assert hook is prepare_deletion


@pytest.mark.asyncio
async def test_work_left_for_after_the_commit_runs(deletion: AsyncMock) -> None:
    after_commit = MagicMock()
    deletion.return_value = after_commit
    assert await _delete(_build(_manager()), str(uuid.uuid4()), _GATE_PASS_HEADERS) == 204
    after_commit.assert_called_once_with()


@pytest.mark.asyncio
async def test_a_refused_deletion_is_a_conflict(deletion: AsyncMock) -> None:
    deletion.side_effect = AccountDeletionBlockedError("owns a shared workspace")
    assert await _delete(_build(_manager()), str(uuid.uuid4()), _GATE_PASS_HEADERS) == 409


@pytest.mark.asyncio
async def test_the_gate_runs_before_the_lookup_so_ids_cant_be_probed(deletion: AsyncMock) -> None:
    manager = _manager()
    manager.get.side_effect = exceptions.UserNotExists()
    status = await _delete(_build(manager), str(uuid.uuid4()), _PLAIN_SUPERUSER_HEADERS)
    assert status == 401
    manager.get.assert_not_awaited()


@pytest.mark.asyncio
async def test_an_unknown_user_is_not_found(deletion: AsyncMock) -> None:
    manager = _manager()
    manager.get.side_effect = exceptions.UserNotExists()
    assert await _delete(_build(manager), str(uuid.uuid4()), _GATE_PASS_HEADERS) == 404
    deletion.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_malformed_id_is_not_found(deletion: AsyncMock) -> None:
    manager = _manager()
    manager.parse_id.side_effect = exceptions.InvalidID()
    assert await _delete(_build(manager), "not-a-uuid", _GATE_PASS_HEADERS) == 404
    deletion.assert_not_awaited()


def test_the_library_delete_route_is_replaced_and_the_others_stay() -> None:
    paths = _build(_manager()).openapi()["paths"]
    assert {path: sorted(methods) for path, methods in paths.items()} == {
        "/users/me": ["get", "patch"],
        "/users/{id}": ["delete", "get", "patch"],
    }
