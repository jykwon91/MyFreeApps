"""Net worth: today's total, its history, and the daily snapshots behind it.

Orchestration only — data access goes through repositories, the counting
rules live in ``net_worth_lines`` and ``net_worth_history``.

``record_today`` writes today's snapshot for everything in today's total. The
account, bank-sync and property-value writes call it inside their own unit of
work, so the snapshot commits (or rolls back) with the change; the scheduler
calls ``record_all_today`` once a day so history has no gaps.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.net_worth_constants import NET_WORTH_CURRENCY, RANGE_DAYS
from app.db.session import unit_of_work
from app.mappers import net_worth_mapper
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.mortgage.mortgage import Mortgage
from app.models.properties.property import Property
from app.repositories.financial_accounts import financial_account_repo
from app.repositories.mortgage import mortgage_repo
from app.repositories.net_worth import balance_snapshot_repo
from app.repositories.properties import property_repo
from app.schemas.net_worth.net_worth_history_response import NetWorthHistoryResponse
from app.schemas.net_worth.net_worth_response import NetWorthResponse
from app.services.net_worth import net_worth_history, net_worth_lines
from app.services.net_worth.net_worth_line import NetWorthLine

logger = logging.getLogger(__name__)

_ONE_DAY = _dt.timedelta(days=1)


class InvalidNetWorthRangeError(ValueError):
    pass


async def _load(
    db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> tuple[list[FinancialAccount], list[Mortgage], list[Property]]:
    accounts = await financial_account_repo.list_for_user(
        db, user_id=user_id, organization_id=organization_id,
    )
    mortgages = await mortgage_repo.list_live_for_user(
        db, user_id=user_id, organization_id=organization_id,
    )
    properties = list(await property_repo.list_by_org(db, organization_id))
    return accounts, mortgages, properties


async def _today_lines(
    db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> list[NetWorthLine]:
    accounts, mortgages, properties = await _load(db, organization_id=organization_id, user_id=user_id)
    return net_worth_lines.build_lines(accounts=accounts, mortgages=mortgages, properties=properties)


async def record_today(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    today: _dt.date,
) -> None:
    lines = await _today_lines(db, organization_id=organization_id, user_id=user_id)
    for line in lines:
        if line.amount_cents is None:
            continue
        await balance_snapshot_repo.upsert(
            db,
            organization_id=organization_id,
            user_id=user_id,
            snapshot_date=today,
            source=line.source,
            source_id=line.source_id,
            balance_cents=line.amount_cents,
        )


async def record_all_today(*, today: _dt.date) -> int:
    """The daily snapshot for every person with something to count. One
    person's failure is logged and never skips the rest. Returns how many
    were recorded."""
    async with unit_of_work() as db:
        owners = await balance_snapshot_repo.list_owners(db)
    recorded = 0
    for organization_id, user_id in owners:
        try:
            async with unit_of_work() as db:
                await record_today(db, organization_id=organization_id, user_id=user_id, today=today)
            recorded += 1
        except Exception:  # noqa: BLE001 — one person's failure must not skip the rest
            logger.exception(
                "Net worth snapshot failed: organization=%s user=%s", organization_id, user_id,
            )
    return recorded


async def get_net_worth(
    *, organization_id: uuid.UUID, user_id: uuid.UUID, today: _dt.date,
) -> NetWorthResponse:
    async with unit_of_work() as db:
        lines = await _today_lines(db, organization_id=organization_id, user_id=user_id)
    return net_worth_mapper.to_response(lines, today)


async def get_history(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    range_key: str,
    today: _dt.date,
) -> NetWorthHistoryResponse:
    if range_key not in RANGE_DAYS:
        raise InvalidNetWorthRangeError(range_key)
    async with unit_of_work() as db:
        accounts, mortgages, properties = await _load(
            db, organization_id=organization_id, user_id=user_id,
        )
        lines = net_worth_lines.build_lines(accounts=accounts, mortgages=mortgages, properties=properties)
        first = await balance_snapshot_repo.first_date(
            db, organization_id=organization_id, user_id=user_id,
        )
        days = RANGE_DAYS[range_key]
        start = first or today
        if days is not None:
            start = max(start, today - _dt.timedelta(days=days))
        rows = await balance_snapshot_repo.list_between(
            db, organization_id=organization_id, user_id=user_id, start=start, end=today - _ONE_DAY,
        )
        rows += await balance_snapshot_repo.list_latest_before(
            db, organization_id=organization_id, user_id=user_id, before=start,
        )

    if not any(net_worth_lines.is_counted(line) for line in lines) and not rows:
        return NetWorthHistoryResponse(range=range_key, currency=NET_WORTH_CURRENCY, points=[])
    sources = net_worth_lines.history_sources(
        accounts=accounts, mortgages=mortgages, properties=properties, today_lines=lines,
    )
    points = net_worth_history.daily_points(
        start=start,
        today=today,
        values=[net_worth_mapper.to_dated_value(row) for row in rows],
        sources=sources,
        today_point=net_worth_mapper.today_point(lines, today),
    )
    return NetWorthHistoryResponse(range=range_key, currency=NET_WORTH_CURRENCY, points=points)
