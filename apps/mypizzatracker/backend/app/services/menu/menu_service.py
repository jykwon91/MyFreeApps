"""Menu business-logic service.

Owns:
- Unique-name enforcement (returns a domain error rather than letting the
  raw DB ``IntegrityError`` bubble through, which is much friendlier for
  the API caller).
- ``active`` 86'd toggle semantics (no extra rules -- it's just a flag).

Hard DELETE is allowed for now because no Order rows exist yet. When orders
land in PR 5, ``OrderPizza.pizza_type_id`` will FK to PizzaType and we'll
need to decide RESTRICT vs SET NULL. Until then, the owner can clean up
typos freely.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.menu.pizza_type import PizzaType
from app.models.menu.topping_type import ToppingType
from app.repositories.menu import menu_repo
from app.schemas.menu.menu_schemas import (
    PizzaTypeCreate,
    PizzaTypeUpdate,
    ToppingTypeCreate,
    ToppingTypeUpdate,
)


class MenuServiceError(Exception):
    """Base for menu rule violations."""

    http_status: int = 400


class MenuNotFoundError(MenuServiceError):
    http_status = 404


class DuplicateMenuNameError(MenuServiceError):
    http_status = 409


# ---------------------------------------------------------------------------
# Pizzas
# ---------------------------------------------------------------------------

async def create_pizza(db: AsyncSession, body: PizzaTypeCreate) -> PizzaType:
    existing = await menu_repo.find_pizza_by_name(db, body.name)
    if existing is not None:
        raise DuplicateMenuNameError(
            f"A pizza named {body.name!r} already exists.",
        )
    return await menu_repo.create_pizza(db, body.model_dump())


async def get_pizza_or_404(
    db: AsyncSession, pizza_id: uuid.UUID,
) -> PizzaType:
    pizza = await menu_repo.get_pizza(db, pizza_id)
    if pizza is None:
        raise MenuNotFoundError(f"PizzaType {pizza_id} not found")
    return pizza


async def list_pizzas(
    db: AsyncSession, *, active_only: bool = False,
) -> list[PizzaType]:
    return await menu_repo.list_pizzas(db, active_only=active_only)


async def update_pizza(
    db: AsyncSession, pizza: PizzaType, body: PizzaTypeUpdate,
) -> PizzaType:
    patch = body.model_dump(exclude_unset=True)
    new_name = patch.get("name")
    if new_name is not None and new_name != pizza.name:
        existing = await menu_repo.find_pizza_by_name(db, new_name)
        if existing is not None and existing.id != pizza.id:
            raise DuplicateMenuNameError(
                f"A pizza named {new_name!r} already exists.",
            )
    if not patch:
        return pizza
    return await menu_repo.update_pizza(db, pizza, patch)


async def delete_pizza(db: AsyncSession, pizza: PizzaType) -> None:
    await menu_repo.delete_pizza(db, pizza)


# ---------------------------------------------------------------------------
# Toppings
# ---------------------------------------------------------------------------

async def create_topping(
    db: AsyncSession, body: ToppingTypeCreate,
) -> ToppingType:
    existing = await menu_repo.find_topping_by_name(db, body.name)
    if existing is not None:
        raise DuplicateMenuNameError(
            f"A topping named {body.name!r} already exists.",
        )
    return await menu_repo.create_topping(db, body.model_dump())


async def get_topping_or_404(
    db: AsyncSession, topping_id: uuid.UUID,
) -> ToppingType:
    topping = await menu_repo.get_topping(db, topping_id)
    if topping is None:
        raise MenuNotFoundError(f"ToppingType {topping_id} not found")
    return topping


async def list_toppings(
    db: AsyncSession, *, active_only: bool = False,
) -> list[ToppingType]:
    return await menu_repo.list_toppings(db, active_only=active_only)


async def update_topping(
    db: AsyncSession, topping: ToppingType, body: ToppingTypeUpdate,
) -> ToppingType:
    patch = body.model_dump(exclude_unset=True)
    new_name = patch.get("name")
    if new_name is not None and new_name != topping.name:
        existing = await menu_repo.find_topping_by_name(db, new_name)
        if existing is not None and existing.id != topping.id:
            raise DuplicateMenuNameError(
                f"A topping named {new_name!r} already exists.",
            )
    if not patch:
        return topping
    return await menu_repo.update_topping(db, topping, patch)


async def delete_topping(db: AsyncSession, topping: ToppingType) -> None:
    await menu_repo.delete_topping(db, topping)
