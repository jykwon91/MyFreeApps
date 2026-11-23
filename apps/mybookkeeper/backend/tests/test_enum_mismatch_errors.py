"""A stored enum value the code doesn't know is a server fault, never a 404.

SQLAlchemy raises a plain ``LookupError`` ("'x' is not among the defined enum
values...") when it loads such a row. The listings and welcome-manual routes
used to catch every ``LookupError`` as "not found" and echo its text. They now
catch only our own not-found types, so the mismatch fails loud as a 500, and
the real error reaches the server's error handler, which logs it.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.properties.property import Property
from app.models.user.user import User
from app.schemas.listings.listing_create_request import ListingCreateRequest
from app.schemas.welcome_manuals.welcome_manual_create_request import (
    WelcomeManualCreateRequest,
)
from app.services.listings import listing_service
from app.services.properties.property_not_found_error import PropertyNotFoundError
from app.services.welcome_manuals import welcome_manual_service

_ENUM_MISMATCH = (
    "'TREEHOUSE' is not among the defined enum values. Enum name: propertytype. "
    "Possible values: SHORT_TERM, LONG_TERM, ..."
)

_LISTING_BODY = {
    "property_id": str(uuid.uuid4()), "title": "x", "monthly_rate": "1500", "room_type": "private_room",
}

# (service module, function, method, path, json body)
_ROUTES = [
    (listing_service, "create_listing", "post", "/listings", _LISTING_BODY),
    (listing_service, "get_listing", "get", f"/listings/{uuid.uuid4()}", None),
    (listing_service, "update_listing", "put", f"/listings/{uuid.uuid4()}", {"title": "x"}),
    (listing_service, "soft_delete_listing", "delete", f"/listings/{uuid.uuid4()}", None),
    (listing_service, "get_public_listing", "get", "/listings/public/some-slug", None),
    (welcome_manual_service, "create_manual", "post", "/welcome-manuals",
     {"title": "x", "property_id": str(uuid.uuid4())}),
    (welcome_manual_service, "get_manual", "get", f"/welcome-manuals/{uuid.uuid4()}", None),
    (welcome_manual_service, "update_manual", "put", f"/welcome-manuals/{uuid.uuid4()}", {"title": "x"}),
    (welcome_manual_service, "soft_delete_manual", "delete", f"/welcome-manuals/{uuid.uuid4()}", None),
]
_ROUTE_IDS = [f"{module.__name__.rsplit('.', 1)[-1]}.{name}" for module, name, *_ in _ROUTES]


@pytest.fixture
def signed_in() -> Iterator[None]:
    ctx = RequestContext(organization_id=uuid.uuid4(), user_id=uuid.uuid4(), org_role=OrgRole.OWNER)
    app.dependency_overrides[current_org_member] = lambda: ctx
    app.dependency_overrides[require_write_access] = lambda: ctx
    yield
    app.dependency_overrides.clear()


def _call(client: TestClient, method: str, path: str, body: dict | None):
    if body is None:
        return client.request(method, path)
    return client.request(method, path, json=body)


@pytest.mark.usefixtures("signed_in")
@pytest.mark.parametrize(("module", "name", "method", "path", "body"), _ROUTES, ids=_ROUTE_IDS)
def test_enum_mismatch_is_a_500_without_its_text(module, name, method, path, body) -> None:
    with patch.object(module, name, side_effect=LookupError(_ENUM_MISMATCH)):
        response = _call(TestClient(app, raise_server_exceptions=False), method, path, body)

    assert response.status_code == 500
    assert "enum" not in response.text
    assert "TREEHOUSE" not in response.text


@pytest.mark.usefixtures("signed_in")
@pytest.mark.parametrize(("module", "name", "method", "path", "body"), _ROUTES, ids=_ROUTE_IDS)
def test_enum_mismatch_reaches_the_server_error_handler(module, name, method, path, body) -> None:
    """The real error leaves the app, where the server and Sentry log it."""
    with patch.object(module, name, side_effect=LookupError(_ENUM_MISMATCH)):
        with pytest.raises(LookupError, match="not among the defined enum values"):
            _call(TestClient(app), method, path, body)


async def _property_with_unknown_type(db: AsyncSession, org: Organization, user: User) -> Property:
    """A property row whose stored ``type`` is not a ``PropertyType`` the code knows."""
    prop = Property(organization_id=org.id, user_id=user.id, name="House", address="1 Main St")
    db.add(prop)
    await db.commit()
    await db.execute(
        text("UPDATE properties SET classification = 'INVESTMENT', type = 'TREEHOUSE' WHERE id = :id"),
        {"id": prop.id.hex},
    )
    await db.commit()
    db.expunge_all()
    return prop


def _patch_sessions(db: AsyncSession, module_path: str):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch.multiple(module_path, AsyncSessionLocal=_fake, unit_of_work=_fake)


class TestPropertyLookupKeepsTheMismatch:
    """The services raise our not-found type only for a missing property."""

    @pytest.mark.asyncio
    async def test_listing_create_lets_the_mismatch_through(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _property_with_unknown_type(db, test_org, test_user)
        payload = ListingCreateRequest(
            property_id=prop.id, title="x", monthly_rate="1500", room_type="private_room",
        )

        with _patch_sessions(db, "app.services.listings.listing_service"):
            with pytest.raises(LookupError, match="TREEHOUSE") as raised:
                await listing_service.create_listing(test_org.id, test_user.id, payload)

        assert not isinstance(raised.value, PropertyNotFoundError)

    @pytest.mark.asyncio
    async def test_welcome_manual_create_lets_the_mismatch_through(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _property_with_unknown_type(db, test_org, test_user)
        payload = WelcomeManualCreateRequest(title="Guide", property_id=prop.id, seed_default_sections=False)

        with _patch_sessions(db, "app.services.welcome_manuals.welcome_manual_service"):
            with pytest.raises(LookupError, match="TREEHOUSE") as raised:
                await welcome_manual_service.create_manual(test_org.id, test_user.id, payload)

        assert not isinstance(raised.value, PropertyNotFoundError)

    @pytest.mark.asyncio
    async def test_missing_property_is_our_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        payload = ListingCreateRequest(
            property_id=uuid.uuid4(), title="x", monthly_rate="1500", room_type="private_room",
        )

        with _patch_sessions(db, "app.services.listings.listing_service"):
            with pytest.raises(PropertyNotFoundError, match="not found"):
                await listing_service.create_listing(test_org.id, test_user.id, payload)
