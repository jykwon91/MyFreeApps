"""Tests for organization-level data isolation.

Verifies that data created under one organization is invisible to queries
scoped to a different organization. Tests at the repository level using
a real SQLite session — no HTTP client needed.
"""
import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property, PropertyType
from app.models.properties.tenant import Tenant
from app.models.user.user import User
from app.repositories import (
    document_repo,
    organization_repo,
    property_repo,
    tenant_repo,
)


# ---------------------------------------------------------------------------
# Fixtures — two orgs, two users, each owning one org
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def user_a(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="user-a@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def user_b(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="user-b@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def org_a(db: AsyncSession, user_a: User) -> Organization:
    org = await organization_repo.create(db, "Org A", user_a.id)
    await db.commit()
    await db.refresh(org)
    return org


@pytest_asyncio.fixture()
async def org_b(db: AsyncSession, user_b: User) -> Organization:
    org = await organization_repo.create(db, "Org B", user_b.id)
    await db.commit()
    await db.refresh(org)
    return org


# ---------------------------------------------------------------------------
# Helper — seed data in a specific org
# ---------------------------------------------------------------------------


async def _create_property(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str,
) -> Property:
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name=name,
        type=PropertyType.SHORT_TERM,
    )
    db.add(prop)
    await db.flush()
    return prop


async def _create_document(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    file_name: str,
    *,
    property_id: uuid.UUID | None = None,
    email_message_id: str | None = None,
) -> Document:
    doc = Document(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        file_name=file_name,
        status="completed",
        source="upload",
        email_message_id=email_message_id,
    )
    db.add(doc)
    await db.flush()
    return doc


async def _create_tenant(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    name: str,
) -> Tenant:
    tenant = Tenant(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        name=name,
    )
    db.add(tenant)
    await db.flush()
    return tenant


# ---------------------------------------------------------------------------
# Document Isolation
# ---------------------------------------------------------------------------


class TestDocumentIsolation:
    @pytest.mark.asyncio
    async def test_documents_in_org_a_invisible_to_org_b(
        self,
        db: AsyncSession,
        user_a: User,
        user_b: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        await _create_document(db, org_a.id, user_a.id, "file_a1.pdf")
        await _create_document(db, org_a.id, user_a.id, "file_a2.pdf")
        await db.commit()

        # Query from org B should return nothing
        docs_b = await document_repo.list_filtered(db, org_b.id)
        assert len(docs_b) == 0

        # Query from org A should return the two documents
        docs_a = await document_repo.list_filtered(db, org_a.id)
        assert len(docs_a) == 2

    @pytest.mark.asyncio
    async def test_get_document_by_id_scoped_to_org(
        self,
        db: AsyncSession,
        user_a: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        doc = await _create_document(db, org_a.id, user_a.id, "scoped.pdf")
        await db.commit()

        found_in_a = await document_repo.get_by_id(db, doc.id, org_a.id)
        assert found_in_a is not None
        assert found_in_a.id == doc.id

        found_in_b = await document_repo.get_by_id(db, doc.id, org_b.id)
        assert found_in_b is None

    @pytest.mark.asyncio
    async def test_each_org_sees_only_its_documents(
        self,
        db: AsyncSession,
        user_a: User,
        user_b: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        await _create_document(db, org_a.id, user_a.id, "org_a.pdf")
        await _create_document(db, org_b.id, user_b.id, "org_b.pdf")
        await db.commit()

        docs_a = await document_repo.list_filtered(db, org_a.id)
        assert all(d.organization_id == org_a.id for d in docs_a)
        names_a = [d.file_name for d in docs_a]
        assert "org_a.pdf" in names_a
        assert "org_b.pdf" not in names_a

        docs_b = await document_repo.list_filtered(db, org_b.id)
        assert all(d.organization_id == org_b.id for d in docs_b)
        names_b = [d.file_name for d in docs_b]
        assert "org_b.pdf" in names_b
        assert "org_a.pdf" not in names_b


# ---------------------------------------------------------------------------
# Property Isolation
# ---------------------------------------------------------------------------


class TestPropertyIsolation:
    @pytest.mark.asyncio
    async def test_properties_in_org_a_invisible_to_org_b(
        self,
        db: AsyncSession,
        user_a: User,
        user_b: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        await _create_property(db, org_a.id, user_a.id, "Property A")
        await db.commit()

        props_b = await property_repo.list_by_org(db, org_b.id)
        assert len(props_b) == 0

        props_a = await property_repo.list_by_org(db, org_a.id)
        assert len(props_a) == 1
        assert props_a[0].name == "Property A"

    @pytest.mark.asyncio
    async def test_get_property_by_id_scoped_to_org(
        self,
        db: AsyncSession,
        user_a: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        prop = await _create_property(db, org_a.id, user_a.id, "Scoped Prop")
        await db.commit()

        found_a = await property_repo.get_by_id(db, prop.id, org_a.id)
        assert found_a is not None

        found_b = await property_repo.get_by_id(db, prop.id, org_b.id)
        assert found_b is None

    @pytest.mark.asyncio
    async def test_get_property_by_name_scoped_to_org(
        self,
        db: AsyncSession,
        user_a: User,
        user_b: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        await _create_property(db, org_a.id, user_a.id, "Same Name")
        await _create_property(db, org_b.id, user_b.id, "Same Name")
        await db.commit()

        prop_a = await property_repo.get_by_name(db, org_a.id, "Same Name")
        assert prop_a is not None
        assert prop_a.organization_id == org_a.id

        prop_b = await property_repo.get_by_name(db, org_b.id, "Same Name")
        assert prop_b is not None
        assert prop_b.organization_id == org_b.id

        assert prop_a.id != prop_b.id


# ---------------------------------------------------------------------------
# Tenant Isolation
# ---------------------------------------------------------------------------


class TestTenantIsolation:
    @pytest.mark.asyncio
    async def test_tenants_in_org_a_invisible_to_org_b(
        self,
        db: AsyncSession,
        user_a: User,
        user_b: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        prop = await _create_property(db, org_a.id, user_a.id, "Tenant Prop")
        await _create_tenant(db, org_a.id, user_a.id, prop.id, "Tenant A")
        await db.commit()

        tenants_b = await tenant_repo.list_by_org(db, org_b.id)
        assert len(tenants_b) == 0

        tenants_a = await tenant_repo.list_by_org(db, org_a.id)
        assert len(tenants_a) == 1
        assert tenants_a[0].name == "Tenant A"

    @pytest.mark.asyncio
    async def test_get_tenant_by_id_scoped_to_org(
        self,
        db: AsyncSession,
        user_a: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        prop = await _create_property(db, org_a.id, user_a.id, "Scoped T Prop")
        tenant = await _create_tenant(db, org_a.id, user_a.id, prop.id, "Scoped Tenant")
        await db.commit()

        found_a = await tenant_repo.get_by_id(db, tenant.id, org_a.id)
        assert found_a is not None

        found_b = await tenant_repo.get_by_id(db, tenant.id, org_b.id)
        assert found_b is None


# ---------------------------------------------------------------------------
# Membership Isolation
# ---------------------------------------------------------------------------


class TestMembershipIsolation:
    @pytest.mark.asyncio
    async def test_user_a_not_member_of_org_b(
        self,
        db: AsyncSession,
        user_a: User,
        org_b: Organization,
    ) -> None:
        member = await organization_repo.get_member(db, org_b.id, user_a.id)
        assert member is None

    @pytest.mark.asyncio
    async def test_list_members_returns_only_org_members(
        self,
        db: AsyncSession,
        user_a: User,
        user_b: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        members_a = await organization_repo.list_members(db, org_a.id)
        member_user_ids_a = [m.user_id for m in members_a]
        assert user_a.id in member_user_ids_a
        assert user_b.id not in member_user_ids_a

        members_b = await organization_repo.list_members(db, org_b.id)
        member_user_ids_b = [m.user_id for m in members_b]
        assert user_b.id in member_user_ids_b
        assert user_a.id not in member_user_ids_b

    @pytest.mark.asyncio
    async def test_invite_for_org_a_not_visible_in_org_b(
        self,
        db: AsyncSession,
        user_a: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        await organization_repo.create_invite(
            db, org_a.id, "invited@example.com", "editor", user_a.id,
        )
        await db.commit()

        invites_a = await organization_repo.list_invites(db, org_a.id)
        assert len(invites_a) == 1

        invites_b = await organization_repo.list_invites(db, org_b.id)
        assert len(invites_b) == 0


# ---------------------------------------------------------------------------
# Cross-org Document Access with Shared User
# ---------------------------------------------------------------------------


class TestCrossOrgSharedUser:
    """A user who belongs to two orgs should only see each org's data in context."""

    @pytest.mark.asyncio
    async def test_shared_user_sees_correct_org_data(
        self,
        db: AsyncSession,
        user_a: User,
        user_b: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        # Add user_a as a member of org_b
        member = OrganizationMember(
            organization_id=org_b.id,
            user_id=user_a.id,
            org_role="viewer",
        )
        db.add(member)

        await _create_document(db, org_a.id, user_a.id, "org_a.pdf")
        await _create_document(db, org_b.id, user_b.id, "org_b.pdf")
        await db.commit()

        docs_in_a = await document_repo.list_filtered(db, org_a.id)
        assert all(d.file_name != "org_b.pdf" for d in docs_in_a)

        docs_in_b = await document_repo.list_filtered(db, org_b.id)
        assert all(d.file_name != "org_a.pdf" for d in docs_in_b)

    @pytest.mark.asyncio
    async def test_email_message_ids_scoped_to_org(
        self,
        db: AsyncSession,
        user_a: User,
        org_a: Organization,
        org_b: Organization,
    ) -> None:
        doc = Document(
            id=uuid.uuid4(),
            organization_id=org_a.id,
            user_id=user_a.id,
            status="completed",
            source="email",
            email_message_id="msg-123",
        )
        db.add(doc)
        await db.commit()

        ids_a = await document_repo.get_email_message_ids(db, org_a.id)
        assert "msg-123" in ids_a

        ids_b = await document_repo.get_email_message_ids(db, org_b.id)
        assert "msg-123" not in ids_b
