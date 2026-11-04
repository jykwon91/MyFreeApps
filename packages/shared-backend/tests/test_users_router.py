"""``build_users_router`` puts ``DELETE /users/{id}`` behind the strict gate.

The gate's own checks are covered in ``test_permissions.py``. These tests use the
real fastapi-users router, so they also fail if a library upgrade renames the
route being replaced.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi_users import FastAPIUsers, exceptions, schemas
from fastapi_users.authentication import AuthenticationBackend, BearerTransport
from httpx import ASGITransport, AsyncClient

from platform_shared.api.users_router import build_users_router

_PLAIN_SUPERUSER_HEADERS = {"Authorization": "Bearer stolen-admin-token"}
_GATE_PASS_HEADERS = {**_PLAIN_SUPERUSER_HEADERS, "X-Test-Gate": "pass"}


class _Read(schemas.BaseUser[uuid.UUID]):
    pass


class _Update(schemas.CreateUpdateDictModel):
    pass


def _build(manager: MagicMock) -> FastAPI:
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
        ),
        prefix="/users",
    )
    return app


def _manager() -> MagicMock:
    manager = MagicMock()
    manager.parse_id = MagicMock(side_effect=uuid.UUID)
    manager.get = AsyncMock(return_value=MagicMock(name="target"))
    manager.delete = AsyncMock()
    return manager


async def _delete(app: FastAPI, user_id: str, headers: dict[str, str]) -> int:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        return (await client.delete(f"/users/{user_id}", headers=headers)).status_code


@pytest.mark.asyncio
async def test_a_superuser_token_alone_cannot_delete_a_user() -> None:
    manager = _manager()
    status = await _delete(_build(manager), str(uuid.uuid4()), _PLAIN_SUPERUSER_HEADERS)
    assert status == 401
    manager.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_passing_the_gate_deletes_the_requested_user() -> None:
    manager = _manager()
    target_id = uuid.uuid4()
    status = await _delete(_build(manager), str(target_id), _GATE_PASS_HEADERS)
    assert status == 204
    manager.get.assert_awaited_once_with(target_id)
    manager.delete.assert_awaited_once()
    assert manager.delete.await_args.args[0] is manager.get.return_value


@pytest.mark.asyncio
async def test_the_gate_runs_before_the_lookup_so_ids_cant_be_probed() -> None:
    manager = _manager()
    manager.get.side_effect = exceptions.UserNotExists()
    status = await _delete(_build(manager), str(uuid.uuid4()), _PLAIN_SUPERUSER_HEADERS)
    assert status == 401
    manager.get.assert_not_awaited()


@pytest.mark.asyncio
async def test_an_unknown_user_is_not_found() -> None:
    manager = _manager()
    manager.get.side_effect = exceptions.UserNotExists()
    assert await _delete(_build(manager), str(uuid.uuid4()), _GATE_PASS_HEADERS) == 404
    manager.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_malformed_id_is_not_found() -> None:
    manager = _manager()
    manager.parse_id.side_effect = exceptions.InvalidID()
    assert await _delete(_build(manager), "not-a-uuid", _GATE_PASS_HEADERS) == 404
    manager.delete.assert_not_awaited()


def test_the_library_delete_route_is_replaced_and_the_others_stay() -> None:
    paths = _build(_manager()).openapi()["paths"]
    assert {path: sorted(methods) for path, methods in paths.items()} == {
        "/users/me": ["get", "patch"],
        "/users/{id}": ["delete", "get", "patch"],
    }
