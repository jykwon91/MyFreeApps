"""Tests for the seed-admin address reservation in PlatformBaseUserManager.

The boot-time seed refuses to promote a non-seed-owned row (hash check in
seed_admin_service); this reservation closes the squat window from the other
side — the address can never be claimed through public registration at all.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi_users import BaseUserManager, exceptions

from platform_shared.auth.user_manager import PlatformBaseUserManager


class _Manager(PlatformBaseUserManager):
    reset_password_token_secret = "x" * 32
    verification_token_secret = "x" * 32
    seed_admin_email = "admin@example.com"


class _UnreservedManager(PlatformBaseUserManager):
    reset_password_token_secret = "x" * 32
    verification_token_secret = "x" * 32
    # seed_admin_email left at the "" default — nothing reserved


def _user_create(email: str) -> SimpleNamespace:
    return SimpleNamespace(email=email, password="a-long-enough-password")


@pytest.mark.asyncio
async def test_reserved_email_rejected_like_taken_email():
    manager = _Manager(MagicMock(name="user_db"))
    with pytest.raises(exceptions.UserAlreadyExists):
        await manager.create(_user_create("admin@example.com"))


@pytest.mark.asyncio
async def test_reservation_is_case_insensitive():
    manager = _Manager(MagicMock(name="user_db"))
    with pytest.raises(exceptions.UserAlreadyExists):
        await manager.create(_user_create("ADMIN@Example.COM"))


@pytest.mark.asyncio
async def test_other_emails_pass_through_to_parent_create():
    manager = _Manager(MagicMock(name="user_db"))
    sentinel = object()
    with patch.object(
        BaseUserManager, "create", new=AsyncMock(return_value=sentinel),
    ) as parent_create:
        result = await manager.create(_user_create("someone@example.com"))
    assert result is sentinel
    parent_create.assert_awaited_once()


@pytest.mark.asyncio
async def test_empty_seed_admin_email_reserves_nothing():
    manager = _UnreservedManager(MagicMock(name="user_db"))
    sentinel = object()
    with patch.object(
        BaseUserManager, "create", new=AsyncMock(return_value=sentinel),
    ):
        result = await manager.create(_user_create("admin@example.com"))
    assert result is sentinel
