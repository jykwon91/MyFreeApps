"""Menu repository -- ORM operations for pizza_type + topping_type."""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.menu.pizza_type import PizzaType
from app.models.menu.topping_type import ToppingType


# ---------------------------------------------------------------------------
# PizzaType
# ---------------------------------------------------------------------------

async def create_pizza(db: AsyncSession, data: dict) -> PizzaType:
    pizza = PizzaType(**data)
    db.add(pizza)
    await db.flush()
    return pizza


async def get_pizza(db: AsyncSession, pizza_id: uuid.UUID) -> Optional[PizzaType]:
    stmt = select(PizzaType).where(PizzaType.id == pizza_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def find_pizza_by_name(db: AsyncSession, name: str) -> Optional[PizzaType]:
    stmt = select(PizzaType).where(PizzaType.name == name)
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_pizzas(
    db: AsyncSession, *, active_only: bool = False,
) -> list[PizzaType]:
    stmt = select(PizzaType).order_by(PizzaType.name.asc())
    if active_only:
        stmt = stmt.where(PizzaType.active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


async def update_pizza(
    db: AsyncSession, pizza: PizzaType, patch: dict,
) -> PizzaType:
    for key, value in patch.items():
        setattr(pizza, key, value)
    await db.flush()
    return pizza


async def delete_pizza(db: AsyncSession, pizza: PizzaType) -> None:
    await db.delete(pizza)
    await db.flush()


# ---------------------------------------------------------------------------
# ToppingType
# ---------------------------------------------------------------------------

async def create_topping(db: AsyncSession, data: dict) -> ToppingType:
    topping = ToppingType(**data)
    db.add(topping)
    await db.flush()
    return topping


async def get_topping(
    db: AsyncSession, topping_id: uuid.UUID,
) -> Optional[ToppingType]:
    stmt = select(ToppingType).where(ToppingType.id == topping_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def find_topping_by_name(
    db: AsyncSession, name: str,
) -> Optional[ToppingType]:
    stmt = select(ToppingType).where(ToppingType.name == name)
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_toppings(
    db: AsyncSession, *, active_only: bool = False,
) -> list[ToppingType]:
    stmt = select(ToppingType).order_by(ToppingType.name.asc())
    if active_only:
        stmt = stmt.where(ToppingType.active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


async def update_topping(
    db: AsyncSession, topping: ToppingType, patch: dict,
) -> ToppingType:
    for key, value in patch.items():
        setattr(topping, key, value)
    await db.flush()
    return topping


async def delete_topping(db: AsyncSession, topping: ToppingType) -> None:
    await db.delete(topping)
    await db.flush()
