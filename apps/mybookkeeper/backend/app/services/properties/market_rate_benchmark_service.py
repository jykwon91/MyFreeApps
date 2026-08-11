"""Service layer for market rate benchmarks and the rate comparison.

Two responsibilities, both thin:

CRUD over the operator's recorded market observations — at most one per service
type, so the write is an upsert keyed on service type rather than an id.

``get_rate_comparison``, which measures every *current* plan against the
benchmark for its service type. It mirrors ``get_renewal_alerts``: same
current-plan reduction, same "sorted most urgent first, plus a count" shape, so
the two dashboard cards behave identically.

All data access goes through repositories; this module never imports SQLAlchemy.
The arithmetic is pure and lives in ``_market_benchmark_compare``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from typing import Protocol

from app.core.market_benchmark_constants import (
    BENCHMARK_STATUS_ABOVE,
    MATERIAL_GAP_PCT,
    is_flat_rate_service,
)
from app.core.utility_plan_constants import SERVICE_TYPES
from app.db.session import unit_of_work
from app.repositories.properties import (
    market_rate_benchmark_repo,
    property_repo,
    utility_plan_repo,
)
from app.schemas.properties.market_rate_benchmark_response import (
    MarketRateBenchmarkResponse,
)
from app.schemas.properties.utility_plan_rate_comparison_response import (
    UtilityPlanRateComparisonResponse,
)
from app.schemas.properties.utility_plan_rate_comparison_row import (
    UtilityPlanRateComparisonRow,
)
from app.services.properties._market_benchmark_compare import (
    ComparableBenchmark,
    compare,
    is_stale,
)
from app.services.properties._utility_plan_helpers import current_plan_ids, to_summary


class _StoredBenchmark(ComparableBenchmark, Protocol):
    """A persisted benchmark: the comparable figures plus its own metadata."""

    id: uuid.UUID
    source: str | None
    notes: str | None
    created_at: _dt.datetime
    updated_at: _dt.datetime


class MarketRateBenchmarkNotFoundError(LookupError):
    pass


class InvalidMarketRateBenchmarkError(ValueError):
    """The payload does not describe a usable benchmark."""


def _to_response(
    benchmark: _StoredBenchmark, *, today: _dt.date | None = None,
) -> MarketRateBenchmarkResponse:
    return MarketRateBenchmarkResponse(
        id=benchmark.id,
        service_type=benchmark.service_type,
        rate_cents_per_kwh=benchmark.rate_cents_per_kwh,
        monthly_cents=benchmark.monthly_cents,
        source=benchmark.source,
        observed_on=benchmark.observed_on,
        notes=benchmark.notes,
        is_stale=is_stale(benchmark.observed_on, today=today),
        created_at=benchmark.created_at,
        updated_at=benchmark.updated_at,
    )


def _assert_known_service_type(service_type: str) -> None:
    # The path parameter reaches the CHECK constraint otherwise, where an
    # unknown value would surface as a 500 rather than a readable 4xx.
    if service_type not in SERVICE_TYPES:
        raise InvalidMarketRateBenchmarkError(
            f"service_type must be one of: {', '.join(sorted(SERVICE_TYPES))}",
        )


def _assert_shape_matches_service(
    service_type: str,
    *,
    rate_cents_per_kwh: Decimal | None,
    monthly_cents: int | None,
) -> None:
    """The figure must be in the unit that service type is priced in.

    The request schema can only check that exactly one shape was sent — the
    service type is a path parameter it never sees. Without this check an
    electricity rate recorded as ``monthly_cents`` divides a per-kWh figure by a
    dollar amount and reports the plan as ~99% below market: not an error, just
    a permanently wrong all-clear. The DB CHECK is the real guarantee; this is
    what turns it into a readable 422 instead of an IntegrityError 500.
    """
    if is_flat_rate_service(service_type):
        if monthly_cents is None:
            raise InvalidMarketRateBenchmarkError(
                f"{service_type} is priced per month — provide monthly_cents, "
                "not rate_cents_per_kwh.",
            )
    elif rate_cents_per_kwh is None:
        raise InvalidMarketRateBenchmarkError(
            f"{service_type} is metered — provide rate_cents_per_kwh, "
            "not monthly_cents.",
        )


# ---------------------------------------------------------------------------
# Benchmark CRUD
# ---------------------------------------------------------------------------

async def list_benchmarks(
    *,
    organization_id: uuid.UUID,
    today: _dt.date | None = None,
) -> list[MarketRateBenchmarkResponse]:
    async with unit_of_work() as db:
        rows = await market_rate_benchmark_repo.list_for_org(
            db, organization_id=organization_id,
        )
        return [_to_response(r, today=today) for r in rows]


async def upsert_benchmark(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    service_type: str,
    rate_cents_per_kwh: Decimal | None,
    monthly_cents: int | None,
    source: str | None,
    observed_on: _dt.date,
    notes: str | None,
    today: _dt.date | None = None,
) -> MarketRateBenchmarkResponse:
    """Record the organization's market rate for ``service_type``.

    ``user_id`` is stored as provenance only — the row it writes belongs to the
    organization, so a second member updating it replaces the first member's
    observation rather than creating a competing one.
    """
    _assert_known_service_type(service_type)
    _assert_shape_matches_service(
        service_type,
        rate_cents_per_kwh=rate_cents_per_kwh,
        monthly_cents=monthly_cents,
    )
    async with unit_of_work() as db:
        benchmark = await market_rate_benchmark_repo.upsert(
            db,
            recorded_by_user_id=user_id,
            organization_id=organization_id,
            service_type=service_type,
            rate_cents_per_kwh=rate_cents_per_kwh,
            monthly_cents=monthly_cents,
            source=source,
            observed_on=observed_on,
            notes=notes,
        )
        return _to_response(benchmark, today=today)


async def delete_benchmark(
    *,
    organization_id: uuid.UUID,
    service_type: str,
) -> None:
    _assert_known_service_type(service_type)
    async with unit_of_work() as db:
        deleted = await market_rate_benchmark_repo.delete_by_service_type(
            db,
            organization_id=organization_id,
            service_type=service_type,
        )
    if not deleted:
        raise MarketRateBenchmarkNotFoundError(service_type)


# ---------------------------------------------------------------------------
# Rate comparison
# ---------------------------------------------------------------------------

async def get_rate_comparison(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    today: _dt.date | None = None,
    material_gap_pct: float = MATERIAL_GAP_PCT,
) -> UtilityPlanRateComparisonResponse:
    """Current plans measured against the market benchmark for their service.

    Superseded plans are skipped for the same reason renewal alerts skip them:
    their price is history, and nothing can be done about it.
    """
    async with unit_of_work() as db:
        all_active = await utility_plan_repo.list_all_active_for_org(
            db, user_id=user_id, organization_id=organization_id,
        )
        names = await property_repo.get_name_map(db, organization_id)
        benchmarks = await market_rate_benchmark_repo.list_for_org(
            db, organization_id=organization_id,
        )

    by_service = {b.service_type: b for b in benchmarks}
    current_ids = current_plan_ids(all_active)

    above_market: list[UtilityPlanRateComparisonRow] = []
    not_compared: list[UtilityPlanRateComparisonRow] = []
    has_stale = False

    for plan in all_active:
        if plan.id not in current_ids:
            continue
        result = compare(
            plan,
            by_service.get(plan.service_type),
            today=today,
            material_gap_pct=material_gap_pct,
        )
        has_stale = has_stale or result.is_stale
        row = UtilityPlanRateComparisonRow(
            plan=to_summary(
                plan,
                property_names=names,
                current_ids=current_ids,
                today=today,
            ),
            status=result.status,
            plan_figure=result.plan_figure,
            benchmark_figure=result.benchmark_figure,
            gap_pct=result.gap_pct,
            benchmark_is_stale=result.is_stale,
        )
        if result.status == BENCHMARK_STATUS_ABOVE:
            above_market.append(row)
        elif result.plan_figure is None:
            # No usable comparison — no benchmark, a regulated tariff, or a
            # figure missing on one side. Kept so the operator can see what is
            # going unchecked rather than assuming everything was measured.
            not_compared.append(row)

    # Widest gap first: the most expensive mistake reads first. ``is not None``
    # rather than ``or`` — Decimal("0") is falsy, so a genuine zero gap would
    # otherwise take the missing-value branch.
    above_market.sort(
        key=lambda r: r.gap_pct if r.gap_pct is not None else Decimal(0),
        reverse=True,
    )
    not_compared.sort(key=lambda r: (r.plan.service_type, r.plan.provider_name))

    return UtilityPlanRateComparisonResponse(
        material_gap_pct=material_gap_pct,
        above_market=above_market,
        not_compared=not_compared,
        total_above_market=len(above_market),
        has_stale_benchmark=has_stale,
    )
