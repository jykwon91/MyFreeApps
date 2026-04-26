"""Tests for taxpayer profile — encryption, repository, service, and API."""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_pii, encrypt_pii
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.organization.taxpayer_profile import TaxpayerProfile
from app.models.user.user import User
from app.repositories.organization import taxpayer_profile_repo
from app.services.organization import taxpayer_profile_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="tp-owner@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture()
async def org(db: AsyncSession, owner: User) -> Organization:
    o = Organization(id=uuid.uuid4(), name="TP Workspace", created_by=owner.id)
    db.add(o)
    await db.flush()
    member = OrganizationMember(organization_id=o.id, user_id=owner.id, org_role="owner")
    db.add(member)
    await db.flush()
    return o


@pytest.fixture(autouse=True)
def _patch_sessions(db: AsyncSession):
    """Route service calls to the test DB session."""

    @asynccontextmanager
    async def _fake_uow():
        yield db

    with (
        patch(
            "app.services.organization.taxpayer_profile_service.unit_of_work",
            _fake_uow,
        ),
        patch(
            "app.services.organization.taxpayer_profile_service.record_event",
            return_value=None,
        ),
    ):
        yield


# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------


class TestEncryptDecryptPii:
    def test_roundtrip(self) -> None:
        plaintext = "123-45-6789"
        assert decrypt_pii(encrypt_pii(plaintext)) == plaintext

    def test_differs_from_token_encryption(self) -> None:
        from app.core.security import encrypt_token
        value = "hello"
        assert encrypt_pii(value) != encrypt_token(value)

    def test_encrypted_value_is_not_plaintext(self) -> None:
        assert "123-45-6789" not in encrypt_pii("123-45-6789")


# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------


class TestTaxpayerProfileRepo:
    @pytest.mark.asyncio
    async def test_get_by_org_returns_none_when_missing(
        self, db: AsyncSession, org: Organization
    ) -> None:
        result = await taxpayer_profile_repo.get_by_org(db, org.id, "primary")
        assert result is None

    @pytest.mark.asyncio
    async def test_upsert_creates_new_profile(
        self, db: AsyncSession, org: Organization
    ) -> None:
        profile = TaxpayerProfile(
            organization_id=org.id,
            filer_type="primary",
            encrypted_first_name=encrypt_pii("Jane"),
            ssn_last_four="6789",
        )
        saved = await taxpayer_profile_repo.upsert(db, profile)
        assert saved.organization_id == org.id
        assert saved.filer_type == "primary"
        assert saved.ssn_last_four == "6789"

    @pytest.mark.asyncio
    async def test_upsert_updates_existing_profile(
        self, db: AsyncSession, org: Organization
    ) -> None:
        profile1 = TaxpayerProfile(
            organization_id=org.id,
            filer_type="primary",
            encrypted_first_name=encrypt_pii("Jane"),
            ssn_last_four="1111",
        )
        await taxpayer_profile_repo.upsert(db, profile1)

        profile2 = TaxpayerProfile(
            organization_id=org.id,
            filer_type="primary",
            encrypted_first_name=encrypt_pii("Janet"),
            ssn_last_four="2222",
        )
        updated = await taxpayer_profile_repo.upsert(db, profile2)
        assert updated.ssn_last_four == "2222"
        assert decrypt_pii(updated.encrypted_first_name) == "Janet"

    @pytest.mark.asyncio
    async def test_delete_by_org_returns_false_when_missing(
        self, db: AsyncSession, org: Organization
    ) -> None:
        result = await taxpayer_profile_repo.delete_by_org(db, org.id, "spouse")
        assert result is False

    @pytest.mark.asyncio
    async def test_delete_by_org_removes_profile(
        self, db: AsyncSession, org: Organization
    ) -> None:
        profile = TaxpayerProfile(organization_id=org.id, filer_type="spouse")
        await taxpayer_profile_repo.upsert(db, profile)
        deleted = await taxpayer_profile_repo.delete_by_org(db, org.id, "spouse")
        assert deleted is True
        assert await taxpayer_profile_repo.get_by_org(db, org.id, "spouse") is None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class TestTaxpayerProfileService:
    @pytest.mark.asyncio
    async def test_get_profile_returns_none_when_missing(
        self, org: Organization, owner: User
    ) -> None:
        result = await taxpayer_profile_service.get_profile(
            org.id, owner.id, "primary"
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_upsert_and_get_profile_masks_ssn(
        self, db: AsyncSession, org: Organization, owner: User
    ) -> None:
        await taxpayer_profile_service.upsert_profile(
            org.id,
            owner.id,
            "primary",
            {"first_name": "John", "last_name": "Doe", "ssn": "123-45-6789"},
        )
        result = await taxpayer_profile_service.get_profile(org.id, owner.id, "primary")
        assert result is not None
        assert result["first_name"] == "John"
        assert result["last_name"] == "Doe"
        # SSN must be masked when include_ssn is False
        assert result["ssn_masked"] == "***-**-6789"

    @pytest.mark.asyncio
    async def test_get_profile_with_include_ssn(
        self, db: AsyncSession, org: Organization, owner: User
    ) -> None:
        await taxpayer_profile_service.upsert_profile(
            org.id, owner.id, "primary", {"ssn": "987-65-4321"},
        )
        result = await taxpayer_profile_service.get_profile(
            org.id, owner.id, "primary", include_ssn=True
        )
        assert result is not None
        assert result["ssn_masked"] == "987-65-4321"

    @pytest.mark.asyncio
    async def test_ssn_without_include_ssn_hides_full_number(
        self, db: AsyncSession, org: Organization, owner: User
    ) -> None:
        await taxpayer_profile_service.upsert_profile(
            org.id, owner.id, "primary", {"ssn": "111-22-3333"},
        )
        result = await taxpayer_profile_service.get_profile(org.id, owner.id, "primary")
        assert result is not None
        assert "111" not in result["ssn_masked"]
        assert "22" not in result["ssn_masked"]
        assert result["ssn_masked"].endswith("3333")

    @pytest.mark.asyncio
    async def test_upsert_rejects_unknown_fields(
        self, org: Organization, owner: User
    ) -> None:
        with pytest.raises(ValueError, match="Unknown fields"):
            await taxpayer_profile_service.upsert_profile(
                org.id, owner.id, "primary", {"evil_field": "hack"}
            )

    @pytest.mark.asyncio
    async def test_delete_profile_returns_true(
        self, db: AsyncSession, org: Organization, owner: User
    ) -> None:
        await taxpayer_profile_service.upsert_profile(
            org.id, owner.id, "spouse", {"first_name": "Jane"}
        )
        deleted = await taxpayer_profile_service.delete_profile(org.id, owner.id, "spouse")
        assert deleted is True

    @pytest.mark.asyncio
    async def test_delete_profile_returns_false_when_missing(
        self, org: Organization, owner: User
    ) -> None:
        deleted = await taxpayer_profile_service.delete_profile(org.id, owner.id, "spouse")
        assert deleted is False

    @pytest.mark.asyncio
    async def test_primary_and_spouse_profiles_are_independent(
        self, db: AsyncSession, org: Organization, owner: User
    ) -> None:
        await taxpayer_profile_service.upsert_profile(
            org.id, owner.id, "primary", {"first_name": "John"}
        )
        await taxpayer_profile_service.upsert_profile(
            org.id, owner.id, "spouse", {"first_name": "Jane"}
        )
        primary = await taxpayer_profile_service.get_profile(org.id, owner.id, "primary")
        spouse = await taxpayer_profile_service.get_profile(org.id, owner.id, "spouse")
        assert primary is not None and primary["first_name"] == "John"
        assert spouse is not None and spouse["first_name"] == "Jane"

    @pytest.mark.asyncio
    async def test_pii_is_not_stored_in_plaintext(
        self, db: AsyncSession, org: Organization, owner: User
    ) -> None:
        await taxpayer_profile_service.upsert_profile(
            org.id, owner.id, "primary", {"first_name": "Secret"}
        )
        from sqlalchemy import select
        row = (
            await db.execute(
                select(TaxpayerProfile).where(
                    TaxpayerProfile.organization_id == org.id,
                    TaxpayerProfile.filer_type == "primary",
                )
            )
        ).scalar_one()
        # The raw DB value must never be the plaintext
        assert row.encrypted_first_name != "Secret"
        assert decrypt_pii(row.encrypted_first_name) == "Secret"
