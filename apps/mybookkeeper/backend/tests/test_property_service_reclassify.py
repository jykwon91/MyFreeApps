"""``property_service.update_property`` against a real row and a real constraint.

The 500 this covers only reproduces end-to-end: the helper unit tests in
``test_property_classification_type.py`` pass a matched pair in by hand, whereas
the bug was that the *stored* ``type`` survived a classification-only PATCH.
Reclassifying a short-term rental as a primary residence therefore has to be
exercised against a row the database actually rejects.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import worker_context
from app.models.properties.property import Property, PropertyType
from app.models.properties.property_classification import PropertyClassification
from app.services.properties import property_service


def _make_fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield session

    return _fake_uow


def _rental(org_id: uuid.UUID, user_id: uuid.UUID) -> Property:
    """A short-term rental — the shape every Peerless property started as."""
    return Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name="6734 Peerless St, Houston, TX 77021",
        address="6734 Peerless St, Houston, TX 77021",
        classification=PropertyClassification.INVESTMENT,
        type=PropertyType.SHORT_TERM,
    )


async def _reclassify(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, prop_id: uuid.UUID,
    updates: dict,
) -> Property | None:
    ctx = worker_context(organization_id=org_id, user_id=user_id)
    with patch(
        "app.services.properties.property_service.unit_of_work",
        _make_fake_uow(db),
    ):
        return await property_service.update_property(ctx, prop_id, updates)


@pytest.mark.asyncio
async def test_rental_to_primary_residence_clears_the_rental_type(db: AsyncSession):
    """The regression: the PATCH carries no ``type``, so the stored one must go.

    Without the reconciliation the flush raises IntegrityError against
    ``chk_prop_classification_type`` and the endpoint returns a 500.
    """
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop = _rental(org_id, user_id)
    db.add(prop)
    await db.flush()

    result = await _reclassify(
        db, org_id, user_id, prop.id,
        {"classification": PropertyClassification.PRIMARY_RESIDENCE},
    )
    assert result is not None
    await db.flush()

    stored = (
        await db.execute(select(Property).where(Property.id == prop.id))
    ).scalar_one()
    assert stored.classification is PropertyClassification.PRIMARY_RESIDENCE
    assert stored.type is None


@pytest.mark.asyncio
async def test_rental_to_second_home_clears_the_rental_type(db: AsyncSession):
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop = _rental(org_id, user_id)
    db.add(prop)
    await db.flush()

    await _reclassify(
        db, org_id, user_id, prop.id,
        {"classification": PropertyClassification.SECOND_HOME},
    )
    await db.flush()

    stored = (
        await db.execute(select(Property).where(Property.id == prop.id))
    ).scalar_one()
    assert stored.type is None


@pytest.mark.asyncio
async def test_primary_residence_back_to_investment_regains_a_type(db: AsyncSession):
    """The constraint needs a non-null type going the other way, too."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop = Property(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        name="6734 Peerless", address="6734 Peerless St",
        classification=PropertyClassification.PRIMARY_RESIDENCE, type=None,
    )
    db.add(prop)
    await db.flush()

    await _reclassify(
        db, org_id, user_id, prop.id,
        {"classification": PropertyClassification.INVESTMENT},
    )
    await db.flush()

    stored = (
        await db.execute(select(Property).where(Property.id == prop.id))
    ).scalar_one()
    assert stored.classification is PropertyClassification.INVESTMENT
    assert stored.type is PropertyType.SHORT_TERM


@pytest.mark.asyncio
async def test_an_explicit_rental_type_is_still_honoured(db: AsyncSession):
    """Reconciling must not trample a type the caller actually sent."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop = _rental(org_id, user_id)
    db.add(prop)
    await db.flush()

    await _reclassify(
        db, org_id, user_id, prop.id,
        {
            "classification": PropertyClassification.INVESTMENT,
            "type": PropertyType.LONG_TERM,
        },
    )
    await db.flush()

    stored = (
        await db.execute(select(Property).where(Property.id == prop.id))
    ).scalar_one()
    assert stored.type is PropertyType.LONG_TERM


@pytest.mark.asyncio
async def test_unrelated_edits_leave_the_rental_type_alone(db: AsyncSession):
    """Renaming a rental must not quietly reshape its classification pair."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prop = _rental(org_id, user_id)
    db.add(prop)
    await db.flush()

    await _reclassify(db, org_id, user_id, prop.id, {"name": "6734 Peerless (unit A)"})
    await db.flush()

    stored = (
        await db.execute(select(Property).where(Property.id == prop.id))
    ).scalar_one()
    assert stored.name == "6734 Peerless (unit A)"
    assert stored.classification is PropertyClassification.INVESTMENT
    assert stored.type is PropertyType.SHORT_TERM
