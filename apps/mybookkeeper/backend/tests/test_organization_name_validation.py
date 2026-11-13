"""An organization's name is trimmed and must fit ``organizations.name`` String(255), on create and rename."""
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.repositories import organization_repo
from app.schemas.organization.organization_name import ORGANIZATION_NAME_MAX_LENGTH
from tests.test_organization_routes import (  # noqa: F401  (fixtures)
    _patch_service_session,
    client_as_owner,
    org,
    owner,
)

REFUSED_NAMES = ["", "   ", "\t\n", "x" * (ORGANIZATION_NAME_MAX_LENGTH + 1)]


class TestCreateOrganizationName:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("name", REFUSED_NAMES)
    async def test_refuses_a_blank_or_too_long_name(self, client_as_owner: AsyncClient, name: str) -> None:
        resp = await client_as_owner.post("/organizations", json={"name": name})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_accepts_the_longest_name(self, client_as_owner: AsyncClient) -> None:
        name = "x" * ORGANIZATION_NAME_MAX_LENGTH
        resp = await client_as_owner.post("/organizations", json={"name": name})
        assert resp.status_code == 201
        assert resp.json()["name"] == name

    @pytest.mark.asyncio
    async def test_stores_the_name_trimmed(self, client_as_owner: AsyncClient, db: AsyncSession) -> None:
        resp = await client_as_owner.post("/organizations", json={"name": "  Lake House \n"})
        assert resp.status_code == 201
        assert resp.json()["name"] == "Lake House"
        stored = await organization_repo.get_by_id(db, uuid.UUID(resp.json()["id"]))
        assert stored is not None
        assert stored.name == "Lake House"


class TestRenameOrganization:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("name", REFUSED_NAMES)
    async def test_refuses_a_blank_or_too_long_name(
        self, client_as_owner: AsyncClient, org: Organization, name: str,
    ) -> None:
        resp = await client_as_owner.patch(f"/organizations/{org.id}", json={"name": name})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_accepts_the_longest_name(self, client_as_owner: AsyncClient, org: Organization) -> None:
        name = "x" * ORGANIZATION_NAME_MAX_LENGTH
        resp = await client_as_owner.patch(f"/organizations/{org.id}", json={"name": name})
        assert resp.status_code == 200
        assert resp.json()["name"] == name

    @pytest.mark.asyncio
    async def test_stores_the_name_trimmed(
        self, client_as_owner: AsyncClient, org: Organization, db: AsyncSession,
    ) -> None:
        resp = await client_as_owner.patch(f"/organizations/{org.id}", json={"name": " Renamed  "})
        assert resp.status_code == 200
        # The test's unit of work doesn't commit, so write it out before reading it back.
        await db.flush()
        await db.refresh(org)
        assert org.name == "Renamed"
