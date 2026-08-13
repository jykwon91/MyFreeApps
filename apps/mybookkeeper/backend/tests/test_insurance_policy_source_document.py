"""A policy may only cite a document its own organization owns.

``documents`` is a global table, so the foreign key proves the document exists
and nothing more. The id arrives verbatim from the request body — a reading
from another tenant's declarations page would otherwise attach cleanly, and the
404-vs-attached difference would tell the caller whether that document exists.

The service opens its own session via ``unit_of_work()``; ``_make_fake_uow``
patches it to yield the in-memory SQLite test session instead.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.listings.listing import Listing
from app.repositories.insurance import insurance_policy_repo
from app.services.insurance import insurance_policy_service

_UOW_TARGET = "app.services.insurance.insurance_policy_service.unit_of_work"

pytestmark = pytest.mark.asyncio


def _make_fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield session
    return _fake_uow


async def _make_listing(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID,
) -> Listing:
    listing = Listing(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=uuid.uuid4(),  # FK not enforced in the SQLite test env
        title="6734 Peerless St",
        slug=f"peerless-{uuid.uuid4().hex[:6]}",
        status="active",
        room_type="private_room",
        monthly_rate=1500.00,
    )
    db.add(listing)
    await db.flush()
    return listing


async def _make_document(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID,
) -> Document:
    doc = Document(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        file_name="dec-page.pdf",
    )
    db.add(doc)
    await db.flush()
    return doc


def _create_kwargs(**overrides):
    fields = {
        "policy_name": "Landlord Protection",
        "source_document_id": None,
        "carrier": None,
        "policy_number": None,
        "effective_date": None,
        "expiration_date": None,
        "coverage_amount_cents": None,
        "premium_cents": None,
        "premium_frequency": None,
        "deductible_cents": None,
        "wind_hail_deductible_pct": None,
        "notes": None,
    }
    fields.update(overrides)
    return fields


class TestSourceDocumentIsolation:
    async def test_a_document_from_our_own_org_is_accepted(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        listing = await _make_listing(db, org_id, user_id)
        doc = await _make_document(db, org_id, user_id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            detail = await insurance_policy_service.create_policy(
                user_id=user_id,
                organization_id=org_id,
                listing_id=listing.id,
                **_create_kwargs(source_document_id=doc.id),
            )

        assert detail.source_document_id == doc.id

    async def test_creating_against_another_orgs_document_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        listing = await _make_listing(db, org_id, user_id)
        theirs = await _make_document(db, uuid.uuid4(), uuid.uuid4())

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(insurance_policy_service.InvalidInsurancePolicyError):
                await insurance_policy_service.create_policy(
                    user_id=user_id,
                    organization_id=org_id,
                    listing_id=listing.id,
                    **_create_kwargs(source_document_id=theirs.id),
                )

    async def test_a_document_id_naming_nothing_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        """Same answer as another org's document — no existence oracle."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        listing = await _make_listing(db, org_id, user_id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(insurance_policy_service.InvalidInsurancePolicyError):
                await insurance_policy_service.create_policy(
                    user_id=user_id,
                    organization_id=org_id,
                    listing_id=listing.id,
                    **_create_kwargs(source_document_id=uuid.uuid4()),
                )

    async def test_a_policy_with_no_source_document_is_still_creatable(
        self, db: AsyncSession,
    ) -> None:
        """Typing a policy in by hand stays the ordinary path."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        listing = await _make_listing(db, org_id, user_id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            detail = await insurance_policy_service.create_policy(
                user_id=user_id,
                organization_id=org_id,
                listing_id=listing.id,
                **_create_kwargs(),
            )

        assert detail.source_document_id is None

    async def test_patching_in_another_orgs_document_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        listing = await _make_listing(db, org_id, user_id)
        policy = await insurance_policy_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            listing_id=listing.id,
            policy_name="Landlord Protection",
        )
        theirs = await _make_document(db, uuid.uuid4(), uuid.uuid4())

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(insurance_policy_service.InvalidInsurancePolicyError):
                await insurance_policy_service.update_policy(
                    user_id=user_id,
                    organization_id=org_id,
                    policy_id=policy.id,
                    fields={"source_document_id": theirs.id},
                )

    async def test_patching_in_our_own_document_is_accepted(
        self, db: AsyncSession,
    ) -> None:
        """Re-reading a dec page against a policy entered by hand."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        listing = await _make_listing(db, org_id, user_id)
        policy = await insurance_policy_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            listing_id=listing.id,
            policy_name="Landlord Protection",
        )
        doc = await _make_document(db, org_id, user_id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            detail = await insurance_policy_service.update_policy(
                user_id=user_id,
                organization_id=org_id,
                policy_id=policy.id,
                fields={"source_document_id": doc.id},
            )

        assert detail.source_document_id == doc.id

    async def test_an_unrelated_patch_does_not_disturb_the_stored_source(
        self, db: AsyncSession,
    ) -> None:
        """``fields`` omits the key entirely — that is not a request to clear it."""
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        listing = await _make_listing(db, org_id, user_id)
        doc = await _make_document(db, org_id, user_id)
        policy = await insurance_policy_repo.create(
            db,
            user_id=user_id,
            organization_id=org_id,
            listing_id=listing.id,
            policy_name="Landlord Protection",
            source_document_id=doc.id,
        )

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            detail = await insurance_policy_service.update_policy(
                user_id=user_id,
                organization_id=org_id,
                policy_id=policy.id,
                fields={"carrier": "Foremost"},
            )

        assert detail.source_document_id == doc.id
        assert detail.carrier == "Foremost"
