"""Tests for demo security — rate limiting, endpoint blocking, and is_demo flag checks."""

import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.user.user import User
from app.repositories.demo import demo_repo


@pytest.fixture()
async def demo_user(db: AsyncSession) -> User:
    """Create a demo user with a demo org."""
    user = User(
        id=uuid.uuid4(),
        email="demo+test-security@mybookkeeper.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest.fixture()
async def demo_org(db: AsyncSession, demo_user: User) -> Organization:
    """Create a demo organization."""
    org = Organization(
        id=uuid.uuid4(),
        name="Demo - Test Security",
        created_by=demo_user.id,
        is_demo=True,
        demo_tag="test-security",
    )
    db.add(org)
    await db.flush()
    member = OrganizationMember(
        organization_id=org.id,
        user_id=demo_user.id,
        org_role="owner",
    )
    db.add(member)
    await db.commit()
    await db.refresh(org)
    return org


@pytest.fixture()
async def regular_user(db: AsyncSession) -> User:
    """Create a regular (non-demo) user."""
    user = User(
        id=uuid.uuid4(),
        email="regular@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest.fixture()
async def regular_org(db: AsyncSession, regular_user: User) -> Organization:
    """Create a regular (non-demo) organization."""
    org = Organization(
        id=uuid.uuid4(),
        name="Regular Workspace",
        created_by=regular_user.id,
        is_demo=False,
    )
    db.add(org)
    await db.flush()
    member = OrganizationMember(
        organization_id=org.id,
        user_id=regular_user.id,
        org_role="owner",
    )
    db.add(member)
    await db.commit()
    await db.refresh(org)
    return org


class TestIsDemoOrgCheck:
    """Test the is_demo flag on organizations."""

    @pytest.mark.asyncio
    async def test_demo_org_returns_true(
        self, db: AsyncSession, demo_org: Organization,
    ) -> None:
        result = await demo_repo.is_demo_org(db, demo_org.id)
        assert result is True

    @pytest.mark.asyncio
    async def test_regular_org_returns_false(
        self, db: AsyncSession, regular_org: Organization,
    ) -> None:
        result = await demo_repo.is_demo_org(db, regular_org.id)
        assert result is False

    @pytest.mark.asyncio
    async def test_nonexistent_org_returns_false(self, db: AsyncSession) -> None:
        result = await demo_repo.is_demo_org(db, uuid.uuid4())
        assert result is False


class TestDemoOrgTag:
    """Test demo_tag column on organizations."""

    @pytest.mark.asyncio
    async def test_demo_org_has_tag(
        self, db: AsyncSession, demo_org: Organization,
    ) -> None:
        assert demo_org.demo_tag == "test-security"

    @pytest.mark.asyncio
    async def test_regular_org_has_no_tag(
        self, db: AsyncSession, regular_org: Organization,
    ) -> None:
        assert regular_org.demo_tag is None


class TestDemoUserListing:
    """Test that listing demo users only returns demo orgs."""

    @pytest.mark.asyncio
    async def test_list_only_demo_orgs(
        self,
        db: AsyncSession,
        demo_org: Organization,
        demo_user: User,
        regular_org: Organization,
        regular_user: User,
    ) -> None:
        result = await demo_repo.list_demo_users(db)
        assert len(result) == 1
        assert result[0]["email"] == demo_user.email
        # Regular user's org should not appear
        org_ids = {r["organization_id"] for r in result}
        assert regular_org.id not in org_ids


class TestDemoRateLimitConfig:
    """Test that config has the right demo rate limit values."""

    def test_demo_max_uploads_default(self) -> None:
        from app.core.config import settings
        assert settings.demo_max_uploads_per_day == 5

    def test_demo_limit_is_stricter_than_regular(self) -> None:
        from app.core.config import settings
        assert settings.demo_max_uploads_per_day < settings.max_uploads_per_user_per_day

    def test_code_default_is_50(self) -> None:
        """The code default for max_uploads_per_user_per_day is 50 (env may override)."""
        from app.core.config import Settings
        field = Settings.model_fields["max_uploads_per_user_per_day"]
        assert field.default == 50


class TestDemoPasswordGeneration:
    """Test that demo passwords are generated uniquely per user."""

    def test_generated_passwords_are_unique(self) -> None:
        from app.services.demo.demo_constants import generate_demo_password
        passwords = {generate_demo_password() for _ in range(10)}
        assert len(passwords) == 10

    def test_generated_password_has_sufficient_length(self) -> None:
        from app.services.demo.demo_constants import generate_demo_password
        password = generate_demo_password()
        assert len(password) >= 16

    def test_no_demo_password_in_config(self) -> None:
        from app.core.config import Settings
        assert "demo_password" not in Settings.model_fields
