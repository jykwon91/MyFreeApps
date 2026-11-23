"""The customer upsert behind every order is audited.

``customer_repo.upsert_customer_by_phone`` used ``INSERT ... ON CONFLICT DO
UPDATE``, which the audit listener never sees. It now writes through the ORM: a
new phone leaves INSERT audit rows, a changed name UPDATE rows, both naming the
actor, and a repeat order under the same name writes nothing.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from platform_shared.core.audit_actor import audit_actor
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audit_erasure import audit_listener_attached
from platform_shared.testing.audited_write_case import assert_row_audited
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AUDIT_CONFIG
from app.models.customer.customer import Customer
from app.repositories.customer import customer_repo

ACTOR = uuid.uuid4()
PHONE = "5125550142"


@pytest.fixture()
def audit_listener() -> Iterator[None]:
    with audit_listener_attached(AUDIT_CONFIG):
        yield


async def _existing(db: AsyncSession, name: str) -> Customer:
    customer = await customer_repo.upsert_customer_by_phone(db, name=name, phone=PHONE)
    await db.flush()  # the seed's INSERT audit rows are written on the next flush
    await db.execute(AuditLog.__table__.delete())
    return customer


async def _customer_audit_count(db: AsyncSession) -> int:
    await db.flush()
    return (await db.execute(
        select(func.count()).select_from(AuditLog).where(AuditLog.table_name == "customer"),
    )).scalar_one()


@pytest.mark.usefixtures("audit_listener")
async def test_a_new_phone_is_audited_as_an_insert(db: AsyncSession) -> None:
    with audit_actor(ACTOR):
        customer = await customer_repo.upsert_customer_by_phone(db, name="Jose", phone=PHONE)

    assert (customer.name, customer.phone) == ("Jose", PHONE)
    await assert_row_audited(db, customer, operation="INSERT", actor=ACTOR, fields=frozenset({"name", "phone"}))


@pytest.mark.usefixtures("audit_listener")
async def test_a_new_name_is_audited_as_an_update(db: AsyncSession) -> None:
    existing = await _existing(db, "Jose")
    updated_before = existing.updated_at

    with audit_actor(ACTOR):
        customer = await customer_repo.upsert_customer_by_phone(db, name="Jose P.", phone=PHONE)

    assert (customer.id, customer.name) == (existing.id, "Jose P.")
    assert customer.updated_at > updated_before
    await assert_row_audited(db, customer, operation="UPDATE", actor=ACTOR, fields=frozenset({"name"}))


@pytest.mark.usefixtures("audit_listener")
async def test_the_same_name_writes_nothing(db: AsyncSession) -> None:
    existing = await _existing(db, "Jose")
    updated_before = existing.updated_at

    with audit_actor(ACTOR):
        customer = await customer_repo.upsert_customer_by_phone(db, name="Jose", phone=PHONE)

    assert (customer.id, customer.updated_at) == (existing.id, updated_before)
    assert await _customer_audit_count(db) == 0
