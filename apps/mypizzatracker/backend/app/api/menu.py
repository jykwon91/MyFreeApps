"""Pizza menu management routes -- operator only.

The customer-facing menu is read-only and will surface only ``active=True``
pizzas + toppings (PR 5 wiring). This module is for the OWNER managing
what's on the menu and toggling 86'd state.

Endpoints (paths registered here; production URLs prepend ``/api``):
  GET    /menu                          -- combined pizzas + toppings
  POST   /menu/pizzas                   -- add a pizza type
  GET    /menu/pizzas                   -- list all pizza types (incl. 86'd)
  PATCH  /menu/pizzas/{pizza_id}        -- edit / toggle 86'd
  DELETE /menu/pizzas/{pizza_id}        -- delete (allowed today; orders FK later)
  POST   /menu/toppings                 -- add a topping type
  GET    /menu/toppings                 -- list all topping types
  PATCH  /menu/toppings/{topping_id}    -- edit / toggle 86'd
  DELETE /menu/toppings/{topping_id}    -- delete
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.schemas.menu.menu_schemas import (
    MenuRead,
    PizzaTypeCreate,
    PizzaTypeRead,
    PizzaTypeUpdate,
    ToppingTypeCreate,
    ToppingTypeRead,
    ToppingTypeUpdate,
)
from app.services.menu import menu_service
from app.services.menu.menu_service import MenuServiceError

router = APIRouter(
    prefix="/menu",
    tags=["menu"],
    dependencies=[Depends(current_active_user)],
)


def _service_error(exc: MenuServiceError) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=str(exc))


# ---------------------------------------------------------------------------
# Combined read
# ---------------------------------------------------------------------------

@router.get("", response_model=MenuRead)
async def get_menu(db: AsyncSession = Depends(get_db)) -> MenuRead:
    pizzas = await menu_service.list_pizzas(db)
    toppings = await menu_service.list_toppings(db)
    return MenuRead(
        pizzas=[PizzaTypeRead.model_validate(p) for p in pizzas],
        toppings=[ToppingTypeRead.model_validate(t) for t in toppings],
    )


# ---------------------------------------------------------------------------
# Pizzas
# ---------------------------------------------------------------------------

@router.post("/pizzas", response_model=PizzaTypeRead, status_code=201)
async def create_pizza(
    body: PizzaTypeCreate,
    db: AsyncSession = Depends(get_db),
) -> PizzaTypeRead:
    try:
        pizza = await menu_service.create_pizza(db, body)
    except MenuServiceError as exc:
        raise _service_error(exc) from exc
    return PizzaTypeRead.model_validate(pizza)


@router.get("/pizzas", response_model=list[PizzaTypeRead])
async def list_pizzas(
    db: AsyncSession = Depends(get_db),
) -> list[PizzaTypeRead]:
    pizzas = await menu_service.list_pizzas(db)
    return [PizzaTypeRead.model_validate(p) for p in pizzas]


@router.patch("/pizzas/{pizza_id}", response_model=PizzaTypeRead)
async def update_pizza(
    pizza_id: uuid.UUID,
    body: PizzaTypeUpdate,
    db: AsyncSession = Depends(get_db),
) -> PizzaTypeRead:
    try:
        pizza = await menu_service.get_pizza_or_404(db, pizza_id)
        pizza = await menu_service.update_pizza(db, pizza, body)
    except MenuServiceError as exc:
        raise _service_error(exc) from exc
    return PizzaTypeRead.model_validate(pizza)


@router.delete("/pizzas/{pizza_id}", status_code=204)
async def delete_pizza(
    pizza_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        pizza = await menu_service.get_pizza_or_404(db, pizza_id)
        await menu_service.delete_pizza(db, pizza)
    except MenuServiceError as exc:
        raise _service_error(exc) from exc


# ---------------------------------------------------------------------------
# Toppings
# ---------------------------------------------------------------------------

@router.post("/toppings", response_model=ToppingTypeRead, status_code=201)
async def create_topping(
    body: ToppingTypeCreate,
    db: AsyncSession = Depends(get_db),
) -> ToppingTypeRead:
    try:
        topping = await menu_service.create_topping(db, body)
    except MenuServiceError as exc:
        raise _service_error(exc) from exc
    return ToppingTypeRead.model_validate(topping)


@router.get("/toppings", response_model=list[ToppingTypeRead])
async def list_toppings(
    db: AsyncSession = Depends(get_db),
) -> list[ToppingTypeRead]:
    toppings = await menu_service.list_toppings(db)
    return [ToppingTypeRead.model_validate(t) for t in toppings]


@router.patch("/toppings/{topping_id}", response_model=ToppingTypeRead)
async def update_topping(
    topping_id: uuid.UUID,
    body: ToppingTypeUpdate,
    db: AsyncSession = Depends(get_db),
) -> ToppingTypeRead:
    try:
        topping = await menu_service.get_topping_or_404(db, topping_id)
        topping = await menu_service.update_topping(db, topping, body)
    except MenuServiceError as exc:
        raise _service_error(exc) from exc
    return ToppingTypeRead.model_validate(topping)


@router.delete("/toppings/{topping_id}", status_code=204)
async def delete_topping(
    topping_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        topping = await menu_service.get_topping_or_404(db, topping_id)
        await menu_service.delete_topping(db, topping)
    except MenuServiceError as exc:
        raise _service_error(exc) from exc
