import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.properties.property import Property, PropertyType
from app.models.user.user import User
from app.repositories import property_repo
from app.services.properties import property_service


class TestPropertyRepoGetByName:
    """Tests for property_repo.get_by_name — case-insensitive lookup."""

    @pytest.mark.asyncio
    async def test_returns_property_when_exact_match(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = Property(
            organization_id=test_org.id, user_id=test_user.id, name="Main Street", address="123 Main St"
        )
        db.add(prop)
        await db.commit()

        result = await property_repo.get_by_name(db, test_org.id, "Main Street")
        assert result is not None
        assert result.name == "Main Street"

    @pytest.mark.asyncio
    async def test_returns_property_case_insensitive(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = Property(
            organization_id=test_org.id, user_id=test_user.id, name="Main Street", address="123 Main St"
        )
        db.add(prop)
        await db.commit()

        result = await property_repo.get_by_name(db, test_org.id, "main street")
        assert result is not None
        assert result.name == "Main Street"

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        result = await property_repo.get_by_name(db, test_org.id, "Nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_isolates_by_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = Property(
            organization_id=test_org.id, user_id=test_user.id, name="Beach House", address="456 Beach Rd"
        )
        db.add(prop)
        await db.commit()

        other_org_id = uuid.uuid4()
        result = await property_repo.get_by_name(db, other_org_id, "Beach House")
        assert result is None


class TestPropertyServiceDuplicate:
    """Tests for create_property — rejects duplicate names."""

    @pytest.mark.asyncio
    async def test_raises_value_error_on_duplicate(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = Property(
            organization_id=test_org.id, user_id=test_user.id, name="Lakehouse", address="789 Lake Dr"
        )
        db.add(prop)
        await db.commit()

        ctx = RequestContext(
            organization_id=test_org.id,
            user_id=test_user.id,
            org_role=OrgRole.OWNER,
        )

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.properties.property_service.unit_of_work", _fake):
            with pytest.raises(ValueError, match="Lakehouse"):
                await property_service.create_property(
                    ctx, "Lakehouse", "different address", type=PropertyType.SHORT_TERM
                )

    @pytest.mark.asyncio
    async def test_creates_when_no_duplicate(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        ctx = RequestContext(
            organization_id=test_org.id,
            user_id=test_user.id,
            org_role=OrgRole.OWNER,
        )

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.properties.property_service.unit_of_work", _fake):
            result = await property_service.create_property(
                ctx, "Unique Place", "100 Unique St", type=PropertyType.LONG_TERM
            )

        assert result.name == "Unique Place"
        assert result.user_id == test_user.id


class TestPropertyRouteDuplicate:
    """Tests for POST /properties — returns 409 on duplicate."""

    @pytest.mark.asyncio
    async def test_returns_409_on_duplicate(self) -> None:
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core.permissions import current_org_member

        fake_ctx = RequestContext(
            organization_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_role=OrgRole.OWNER,
        )
        app.dependency_overrides[current_org_member] = lambda: fake_ctx

        with patch(
            "app.api.properties.property_service.create_property",
            side_effect=ValueError("A property named 'Dup' already exists"),
        ):
            client = TestClient(app)
            response = client.post(
                "/properties",
                json={"name": "Dup", "address": "1 Dup St", "type": "short_term"},
            )

        assert response.status_code == 409
        assert "already exists" in response.json()["detail"]

        app.dependency_overrides.clear()
