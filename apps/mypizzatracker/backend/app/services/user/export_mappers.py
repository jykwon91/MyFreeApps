"""Pure ORM -> JSON-safe dict mapping for the account data export.

Only whitelisted domain columns are emitted, so secrets on the user row
(hashed_password, TOTP secret, recovery codes, tokens) can never leak.
"""
from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from app.models.customer.customer import Customer
from app.models.drop.drop import Drop
from app.models.drop.slot import Slot
from app.models.expense.expense import Expense
from app.models.menu.pizza_type import PizzaType
from app.models.menu.topping_type import ToppingType
from app.models.order.order import Order
from app.models.order.order_pizza import OrderPizza
from app.models.order.order_pizza_topping import OrderPizzaTopping


def _iso(value: datetime | date | time | None) -> str | None:
    return value.isoformat() if value is not None else None


def _money(value: Decimal) -> str:
    return str(value)


def user_to_export_dict(user: Any) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "is_verified": user.is_verified,
        "totp_enabled": user.totp_enabled,
    }


def slot_to_export_dict(slot: Slot) -> dict[str, Any]:
    return {
        "id": str(slot.id),
        "pickup_time": _iso(slot.pickup_time),
        "max_pizzas": slot.max_pizzas,
    }


def drop_to_export_dict(drop: Drop) -> dict[str, Any]:
    return {
        "id": str(drop.id),
        "date": _iso(drop.date),
        "name": drop.name,
        "slot_window_start": _iso(drop.slot_window_start),
        "slot_window_end": _iso(drop.slot_window_end),
        "status": drop.status,
        "tip_total": _money(drop.tip_total),
        "created_at": _iso(drop.created_at),
        "slots": [slot_to_export_dict(s) for s in sorted(drop.slots, key=lambda s: s.pickup_time)],
    }


def pizza_type_to_export_dict(pizza: PizzaType) -> dict[str, Any]:
    return {
        "id": str(pizza.id),
        "name": pizza.name,
        "price": _money(pizza.price),
        "description": pizza.description,
        "active": pizza.active,
    }


def topping_type_to_export_dict(topping: ToppingType) -> dict[str, Any]:
    return {
        "id": str(topping.id),
        "name": topping.name,
        "price_delta": _money(topping.price_delta),
        "active": topping.active,
    }


def customer_to_export_dict(customer: Customer) -> dict[str, Any]:
    return {
        "id": str(customer.id),
        "name": customer.name,
        "phone": customer.phone,
        "notes": customer.notes,
        "created_at": _iso(customer.created_at),
    }


def _order_topping_to_export_dict(topping: OrderPizzaTopping) -> dict[str, Any]:
    return {
        "topping_type_id": str(topping.topping_type_id),
        "price_delta_snapshot": _money(topping.price_delta_snapshot),
    }


def _order_pizza_to_export_dict(pizza: OrderPizza) -> dict[str, Any]:
    return {
        "id": str(pizza.id),
        "pizza_type_id": str(pizza.pizza_type_id),
        "modifications_text": pizza.modifications_text,
        "is_free": pizza.is_free,
        "price_snapshot": _money(pizza.price_snapshot),
        "toppings": [_order_topping_to_export_dict(t) for t in pizza.toppings],
    }


def order_to_export_dict(order: Order) -> dict[str, Any]:
    return {
        "id": str(order.id),
        "drop_id": str(order.drop_id),
        "slot_id": str(order.slot_id),
        "customer_id": str(order.customer_id),
        "payment_method_tag": order.payment_method_tag,
        "payment_status": order.payment_status,
        "status": order.status,
        "ready_text_sent_at": _iso(order.ready_text_sent_at),
        "created_at": _iso(order.created_at),
        "pizzas": [_order_pizza_to_export_dict(p) for p in order.pizzas],
    }


def expense_to_export_dict(expense: Expense) -> dict[str, Any]:
    return {
        "id": str(expense.id),
        "drop_id": str(expense.drop_id),
        "vendor": expense.vendor,
        "category": expense.category,
        "amount": _money(expense.amount),
        "description": expense.description,
        "created_at": _iso(expense.created_at),
    }
