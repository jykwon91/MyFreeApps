"""POST /admin/demo/users replies with our own wording only.

Only ``DemoEmailTakenError`` becomes a 409 with its message. Any other
``ValueError`` (pydantic re-checking the credentials, say) is not caught there,
so its text never reaches the reply; it falls through to the generic 500.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.api import demo as demo_api
from app.models.user.user import User
from app.schemas.demo.demo import DemoCreateRequest
from app.services.demo import demo_service
from app.services.demo.demo_email_taken_error import DemoEmailTakenError

_LIBRARY_TEXT = "1 validation error for DemoCredentials email value is not a valid email address"


def _admin() -> User:
    return User(id=uuid.uuid4(), email="admin@example.com", hashed_password="x")


async def test_email_taken_is_a_409_with_our_wording(monkeypatch: pytest.MonkeyPatch) -> None:
    async def taken(**_: object) -> None:
        raise DemoEmailTakenError("A user with email 'a@b.com' already exists.")

    monkeypatch.setattr(demo_service, "create_demo_user", taken)

    with pytest.raises(HTTPException) as exc_info:
        await demo_api.create_demo_user(DemoCreateRequest(), _admin=_admin())

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "A user with email 'a@b.com' already exists."


async def test_library_value_error_is_not_echoed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def broken(**_: object) -> None:
        raise ValueError(_LIBRARY_TEXT)

    monkeypatch.setattr(demo_service, "create_demo_user", broken)

    # Propagates untouched instead of becoming a 409 that quotes it.
    with pytest.raises(ValueError, match="validation error"):
        await demo_api.create_demo_user(DemoCreateRequest(), _admin=_admin())
