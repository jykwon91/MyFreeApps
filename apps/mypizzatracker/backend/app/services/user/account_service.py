"""MyPizzaTracker account-management services.

delete_user_data: wired into the shared account-deletion router. Deletes
all app-owned data for the user. As domain models are added, populate this
with the right per-table deletes.

build_export: assembles a full data export (profile, drops with slots, menu,
customers, orders with their pizzas/toppings, and expenses). The app is
single-user, so every domain row belongs to the exporting operator.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.user_export import user_to_export_dict

from app.models.user.user import User
from app.repositories.customer import customer_repo
from app.repositories.drop import drop_repo
from app.repositories.expense import expense_repo
from app.repositories.menu import menu_repo
from app.repositories.order import order_repo
from app.services.user import export_mappers

logger = logging.getLogger(__name__)


async def delete_user_data(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Delete all app-owned data for ``user_id``.

    Scaffold stub: no user-scoped domain rows yet. The shared deletion
    router handles the user row itself via its own cascade logic.
    """
    logger.info("delete_user_data called for user_id=%s -- no domain rows to delete", user_id)


async def build_export(db: AsyncSession, user: User) -> dict:
    """Assemble the full data export for ``user``.

    Includes profile metadata plus every drop (with slots), menu pizza and
    topping, customer, order (with pizzas and toppings), and expense. Never
    includes hashed_password, TOTP secret, or recovery codes -- the mappers
    emit whitelisted columns only.
    """
    drops = await drop_repo.list_drops(db)
    pizzas = await menu_repo.list_pizzas(db)
    toppings = await menu_repo.list_toppings(db)
    customers = await customer_repo.list_all_customers(db)
    orders = await order_repo.list_all_orders(db)
    expenses = await expense_repo.list_all_expenses(db)

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": user_to_export_dict(user),
        "drops": [export_mappers.drop_to_export_dict(d) for d in drops],
        "menu": {
            "pizzas": [export_mappers.pizza_type_to_export_dict(p) for p in pizzas],
            "toppings": [export_mappers.topping_type_to_export_dict(t) for t in toppings],
        },
        "customers": [export_mappers.customer_to_export_dict(c) for c in customers],
        "orders": [export_mappers.order_to_export_dict(o) for o in orders],
        "expenses": [export_mappers.expense_to_export_dict(e) for e in expenses],
    }
