"""A policy belongs to a property, and only to one its own organization owns.

The building is what the policy insures, so ``property_id`` is the subject of
the row rather than a label on it. Two things follow, and both are tested here:

* the id arrives verbatim from the request body, so ownership is checked rather
  than trusted — the foreign key proves the property row exists and nothing
  about who it belongs to;
* every read names the property, because a list of policy names alone cannot
  tell the operator which of three near-identical houses is uninsured.

The service opens its own session via ``unit_of_work()``; ``_make_fake_uow``
patches it to yield the in-memory SQLite test session instead.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.property import Property
from app.services.insurance import insurance_policy_service

_UOW_TARGET = "app.services.insurance.insurance_policy_service.unit_of_work"

pytestmark = pytest.mark.asyncio


def _make_fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield session
    return _fake_uow


async def _make_property(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, name: str = "6734 Peerless St",
) -> Property:
    prop = Property(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id, name=name,
    )
    db.add(prop)
    await db.flush()
    return prop


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


class TestPropertyIsolation:
    async def test_a_property_from_our_own_org_is_accepted(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id)

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            detail = await insurance_policy_service.create_policy(
                user_id=user_id,
                organization_id=org_id,
                property_id=prop.id,
                **_create_kwargs(),
            )

        assert detail.property_id == prop.id

    async def test_creating_against_another_orgs_property_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        theirs = await _make_property(db, uuid.uuid4(), uuid.uuid4())

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(insurance_policy_service.InvalidInsurancePolicyError):
                await insurance_policy_service.create_policy(
                    user_id=user_id,
                    organization_id=org_id,
                    property_id=theirs.id,
                    **_create_kwargs(),
                )

    async def test_creating_against_a_property_that_does_not_exist_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            with pytest.raises(insurance_policy_service.InvalidInsurancePolicyError):
                await insurance_policy_service.create_policy(
                    user_id=user_id,
                    organization_id=org_id,
                    property_id=uuid.uuid4(),
                    **_create_kwargs(),
                )


class TestPropertyNameOnReads:
    async def test_create_returns_the_property_name(self, db: AsyncSession) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        prop = await _make_property(db, org_id, user_id, name="6738 Peerless St")

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            detail = await insurance_policy_service.create_policy(
                user_id=user_id,
                organization_id=org_id,
                property_id=prop.id,
                **_create_kwargs(),
            )

        assert detail.property_name == "6738 Peerless St"

    async def test_list_names_the_property_on_every_row(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        one = await _make_property(db, org_id, user_id, name="6732 Peerless St")
        two = await _make_property(db, org_id, user_id, name="6738 Peerless St")

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            for prop in (one, two):
                await insurance_policy_service.create_policy(
                    user_id=user_id,
                    organization_id=org_id,
                    property_id=prop.id,
                    **_create_kwargs(),
                )
            listed = await insurance_policy_service.list_policies(
                user_id=user_id, organization_id=org_id,
            )

        assert {item.property_name for item in listed.items} == {
            "6732 Peerless St", "6738 Peerless St",
        }

    async def test_list_filters_to_a_single_property(
        self, db: AsyncSession,
    ) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        wanted = await _make_property(db, org_id, user_id, name="6732 Peerless St")
        other = await _make_property(db, org_id, user_id, name="6738 Peerless St")

        with patch(_UOW_TARGET, _make_fake_uow(db)):
            for prop in (wanted, other):
                await insurance_policy_service.create_policy(
                    user_id=user_id,
                    organization_id=org_id,
                    property_id=prop.id,
                    **_create_kwargs(),
                )
            listed = await insurance_policy_service.list_policies(
                user_id=user_id, organization_id=org_id, property_id=wanted.id,
            )

        assert [item.property_id for item in listed.items] == [wanted.id]
