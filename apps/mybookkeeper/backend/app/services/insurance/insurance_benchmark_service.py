"""Service layer for the insurance benchmark and the premium comparison.

Two responsibilities, both thin:

CRUD over the operator's recorded market observation — at most one per
organization, so the write is an upsert with no key beyond the org.

``get_premium_comparison``, which measures every unexpired policy against that
benchmark. It mirrors the utility feature's ``get_rate_comparison``: same
"sorted worst first, plus a count" shape, so the two dashboard cards behave
identically.

All data access goes through repositories; this module never imports SQLAlchemy.
The arithmetic is pure and lives in ``_insurance_benchmark_compare``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.insurance_benchmark_constants import (
    BENCHMARK_STATUS_ABOVE,
    BENCHMARK_STATUS_AT_OR_BELOW,
    MATERIAL_GAP_PCT,
)
from app.db.session import unit_of_work
from app.repositories.insurance import (
    insurance_benchmark_repo,
    insurance_policy_repo,
)
from app.repositories.properties import property_repo
from app.schemas.insurance.insurance_benchmark_response import (
    InsuranceBenchmarkResponse,
)
from app.schemas.insurance.insurance_policy_premium_comparison_response import (
    InsurancePolicyPremiumComparisonResponse,
)
from app.schemas.insurance.insurance_policy_premium_comparison_row import (
    InsurancePolicyPremiumComparisonRow,
)
from app.schemas.insurance.insurance_policy_summary import InsurancePolicySummary
from app.services.insurance._insurance_benchmark_compare import compare
from app.services.insurance.premium_math import annual_premium_cents

# The comparison never pages. One benchmark measures every policy the operator
# holds, and a portfolio of insurance policies is bounded by the number of
# listings — this is not a table that grows without limit.
_COMPARISON_PAGE_SIZE = 500


class InsuranceBenchmarkNotFoundError(LookupError):
    pass


async def get_benchmark(
    *, organization_id: uuid.UUID,
) -> InsuranceBenchmarkResponse | None:
    async with unit_of_work() as db:
        row = await insurance_benchmark_repo.get_for_org(
            db, organization_id=organization_id,
        )
        return None if row is None else InsuranceBenchmarkResponse.model_validate(row)


async def upsert_benchmark(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    annual_premium_cents: int,
    coverage_amount_cents: int,
    region_label: str | None,
    source: str | None,
    observed_on: _dt.date,
    notes: str | None,
) -> InsuranceBenchmarkResponse:
    async with unit_of_work() as db:
        row = await insurance_benchmark_repo.upsert(
            db,
            recorded_by_user_id=user_id,
            organization_id=organization_id,
            annual_premium_cents=annual_premium_cents,
            coverage_amount_cents=coverage_amount_cents,
            region_label=region_label,
            source=source,
            observed_on=observed_on,
            notes=notes,
        )
        return InsuranceBenchmarkResponse.model_validate(row)


async def delete_benchmark(*, organization_id: uuid.UUID) -> None:
    async with unit_of_work() as db:
        deleted = await insurance_benchmark_repo.delete_for_org(
            db, organization_id=organization_id,
        )
    if not deleted:
        raise InsuranceBenchmarkNotFoundError


def _is_expired(policy_expiration: _dt.date | None, today: _dt.date) -> bool:
    """A policy whose term has already ended.

    Unexpired includes policies with no expiration date recorded: an unknown
    end date is not evidence the policy has lapsed, and dropping those rows
    would silently exclude them from the comparison.
    """
    return policy_expiration is not None and policy_expiration < today


async def get_premium_comparison(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    today: _dt.date | None = None,
) -> InsurancePolicyPremiumComparisonResponse:
    """Every unexpired policy measured against the organization's benchmark."""
    reference = today or _dt.date.today()

    async with unit_of_work() as db:
        benchmark = await insurance_benchmark_repo.get_for_org(
            db, organization_id=organization_id,
        )
        rows = await insurance_policy_repo.list_for_org(
            db,
            user_id=user_id,
            organization_id=organization_id,
            limit=_COMPARISON_PAGE_SIZE,
            offset=0,
        )
        names = await property_repo.get_name_map(db, organization_id)

    above: list[InsurancePolicyPremiumComparisonRow] = []
    not_compared: list[InsurancePolicyPremiumComparisonRow] = []
    considered = 0

    for row in rows:
        if _is_expired(row.expiration_date, reference):
            continue
        considered += 1
        summary = InsurancePolicySummary.model_validate(row).model_copy(
            update={"property_name": names.get(row.property_id)},
        )
        result = compare(
            annual_premium_cents(row.premium_cents, row.premium_frequency),
            row.coverage_amount_cents,
            benchmark,
            today=reference,
        )
        comparison_row = InsurancePolicyPremiumComparisonRow(
            policy=summary,
            status=result.status,
            policy_rate_cents_per_1000=result.policy_rate_cents_per_1000,
            benchmark_rate_cents_per_1000=result.benchmark_rate_cents_per_1000,
            gap_pct=result.gap_pct,
            benchmark_is_stale=result.is_stale,
        )
        if result.status == BENCHMARK_STATUS_ABOVE:
            above.append(comparison_row)
        elif result.status != BENCHMARK_STATUS_AT_OR_BELOW:
            # no_benchmark and not_comparable. A policy that is at or below the
            # market is deliberately absent from both lists: it needs no action
            # and no explanation, and listing it would bury the ones that do.
            not_compared.append(comparison_row)

    # Widest gap first — the most expensive mistake reads first. ``gap_pct`` is
    # never None on an above-market row, but the fallback keeps the sort total
    # rather than trusting that invariant at runtime.
    above.sort(key=lambda r: r.gap_pct or 0, reverse=True)

    return InsurancePolicyPremiumComparisonResponse(
        material_gap_pct=MATERIAL_GAP_PCT,
        benchmark=(
            None if benchmark is None
            else InsuranceBenchmarkResponse.model_validate(benchmark)
        ),
        above_market=above,
        not_compared=not_compared,
        total_above_market=len(above),
        total_considered=considered,
        has_stale_benchmark=any(r.benchmark_is_stale for r in above + not_compared),
    )
