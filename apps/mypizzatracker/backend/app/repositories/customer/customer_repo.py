"""Customer repository.

Thin ORM layer: lookup-by-phone + insert. Phone normalization is the service's
responsibility -- the repo just takes the already-normalized value.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer.customer import Customer


async def get_customer_by_phone(
    db: AsyncSession, phone: str,
) -> Optional[Customer]:
    stmt = select(Customer).where(Customer.phone == phone)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_customer_by_id(
    db: AsyncSession, customer_id: uuid.UUID,
) -> Optional[Customer]:
    stmt = select(Customer).where(Customer.id == customer_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_customer(db: AsyncSession, data: dict) -> Customer:
    customer = Customer(**data)
    db.add(customer)
    await db.flush()
    return customer


async def update_customer(
    db: AsyncSession, customer: Customer, patch: dict,
) -> Customer:
    for key, value in patch.items():
        setattr(customer, key, value)
    await db.flush()
    return customer
