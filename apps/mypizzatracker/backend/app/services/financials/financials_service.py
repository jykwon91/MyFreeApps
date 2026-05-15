"""Per-drop financials rollup + drop-health classifier.

Computes the full P&L for one drop: pizza count (non-no-show), revenue
(sum of pizza price_snapshot + topping price_delta_snapshot across non-
no-show orders, excluding free pizzas), tip total (from Drop.tip_total),
expense total (sum of Expense.amount for the drop), profit (revenue +
tip - expenses), and a green/amber/red health badge derived from profit.

Tip mutation lives here too -- one service per surface keeps the API
layer thin. Closed drops are read-only for both tip and expenses (see
expense_service for the expense side); the closed-drop guard is enforced
HERE for the tip mutation.

Drop-health thresholds are documented as initial-MVP constants; the
operator can adjust them in code as they get a feel for what's healthy
for their drop scale. A future PR can make them configurable per-drop.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.drop.drop import Drop
from app.models.order.order import Order
from app.models.order.order_pizza import OrderPizza
from app.repositories.drop import drop_repo
from app.repositories.expense import expense_repo
from app.schemas.expense.expense_schemas import ExpenseRead
from app.schemas.financials.financials_schemas import (
    DropFinancials,
    DropFinancialsHeader,
    DropHealth,
)


# Drop-health thresholds. Profit-in-dollars axis -- documented in the
# design review as the right shape for a fixed-cost operation at single-
# operator scale.
HEALTH_GREEN_FLOOR = Decimal("50.00")
HEALTH_RED_CEILING = Decimal("0.00")


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class FinancialsServiceError(Exception):
    http_status: int = 400


class DropNotFoundError(FinancialsServiceError):
    http_status = 404


class DropClosedForFinancialsError(FinancialsServiceError):
    """Cannot mutate tip on a closed drop."""

    http_status = 409


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_financials(db: AsyncSession, drop_id: uuid.UUID) -> DropFinancials:
    drop = await _get_drop(db, drop_id)

    pizza_count, revenue = await _compute_revenue(db, drop_id)
    expense_total = await expense_repo.sum_expenses_for_drop(db, drop_id)
    tip_total = Decimal(drop.tip_total)
    profit = (revenue + tip_total - expense_total).quantize(Decimal("0.01"))

    expenses = await expense_repo.list_expenses_for_drop(db, drop_id)

    return DropFinancials(
        drop=DropFinancialsHeader(
            id=drop.id,
            name=drop.name,
            date=drop.date,
            status=drop.status,
        ),
        pizza_count=pizza_count,
        revenue=revenue.quantize(Decimal("0.01")),
        tip_total=tip_total.quantize(Decimal("0.01")),
        expense_total=expense_total.quantize(Decimal("0.01")),
        profit=profit,
        health=_classify_health(profit),
        expenses=[ExpenseRead.model_validate(e) for e in expenses],
    )


async def update_tip(
    db: AsyncSession, drop_id: uuid.UUID, tip_total: Decimal,
) -> Drop:
    drop = await _get_drop(db, drop_id)
    if drop.status == "closed":
        raise DropClosedForFinancialsError(
            "Drop is closed; tip is read-only.",
        )
    return await drop_repo.update_drop(db, drop, {"tip_total": tip_total})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_drop(db: AsyncSession, drop_id: uuid.UUID) -> Drop:
    drop = await drop_repo.get_drop(db, drop_id)
    if drop is None:
        raise DropNotFoundError(f"Drop {drop_id} not found")
    return drop


async def _compute_revenue(
    db: AsyncSession, drop_id: uuid.UUID,
) -> tuple[int, Decimal]:
    """Sum non-no-show, non-free pizza price_snapshot + topping deltas.

    Done in Python rather than as a single SQL sum so the per-pizza
    semantics (skip free, skip no-show, include each topping's
    snapshot) stay readable. Drops are bounded in size (a single
    selling event) so the row count is fine for in-memory aggregation.
    """
    stmt = (
        select(Order)
        .where(Order.drop_id == drop_id)
        .where(Order.status != "no_show")
        .options(selectinload(Order.pizzas).selectinload(OrderPizza.toppings))
    )
    orders = list((await db.execute(stmt)).scalars().all())

    pizza_count = 0
    revenue = Decimal("0.00")
    for order in orders:
        pizza_count += len(order.pizzas)
        for pizza in order.pizzas:
            if pizza.is_free:
                continue
            revenue += Decimal(pizza.price_snapshot)
            for topping in pizza.toppings:
                revenue += Decimal(topping.price_delta_snapshot)
    return pizza_count, revenue


def _classify_health(profit: Decimal) -> DropHealth:
    if profit <= HEALTH_RED_CEILING:
        return "red"
    if profit < HEALTH_GREEN_FLOOR:
        return "amber"
    return "green"
