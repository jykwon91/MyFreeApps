"""Tests for prompt service layer."""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.extraction.extraction_prompt import ExtractionPrompt
from app.models.user.user import User
from app.services.extraction import prompt_service


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with (
        patch("app.services.extraction.prompt_service.AsyncSessionLocal", _fake_session),
        patch("app.services.extraction.prompt_service.unit_of_work", _fake_session),
    ):
        yield


@pytest_asyncio.fixture()
async def user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="prompt-test@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class TestGetMyPrompt:
    @pytest.mark.asyncio
    async def test_returns_none_when_no_prompt(self, user: User) -> None:
        result = await prompt_service.get_my_prompt(user.id)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_active_prompt(
        self, db: AsyncSession, user: User,
    ) -> None:
        prompt = ExtractionPrompt(
            name="Test", prompt_text="Extract stuff",
            mode="extend", is_active=True, user_id=user.id,
        )
        db.add(prompt)
        await db.commit()

        result = await prompt_service.get_my_prompt(user.id)
        assert result is not None
        assert result.name == "Test"
        assert result.is_active is True


class TestUpdateMyPrompt:
    @pytest.mark.asyncio
    async def test_creates_and_activates(self, user: User) -> None:
        result = await prompt_service.update_my_prompt(
            user.id, "New Prompt", "Extract invoices", "extend", True,
        )
        assert result.name == "New Prompt"
        assert result.is_active is True
        assert result.user_id == user.id


class TestDeleteMyPrompt:
    @pytest.mark.asyncio
    async def test_deactivates_prompt(
        self, db: AsyncSession, user: User,
    ) -> None:
        prompt = ExtractionPrompt(
            name="Delete Me", prompt_text="stuff",
            mode="extend", is_active=True, user_id=user.id,
        )
        db.add(prompt)
        await db.commit()

        await prompt_service.delete_my_prompt(user.id)
        await db.flush()
        await db.refresh(prompt)
        assert prompt.is_active is False

    @pytest.mark.asyncio
    async def test_noop_when_no_prompt(self, user: User) -> None:
        # Should not raise
        await prompt_service.delete_my_prompt(user.id)


class TestListPrompts:
    @pytest.mark.asyncio
    async def test_returns_user_prompts(
        self, db: AsyncSession, user: User,
    ) -> None:
        prompt = ExtractionPrompt(
            name="Listed", prompt_text="stuff",
            mode="extend", is_active=False, user_id=user.id,
        )
        db.add(prompt)
        await db.commit()

        result = await prompt_service.list_prompts(user.id)
        assert len(result) >= 1
        names = [p.name for p in result]
        assert "Listed" in names
