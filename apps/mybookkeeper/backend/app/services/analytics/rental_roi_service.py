"""Rental ROI — what each rental needs to earn per month, against what it earns.

Built from the last 12 full months of approved transactions plus any loan
records; a purchase price, when there is one, turns break-even into a target.
"""
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from app.core.context import RequestContext
from app.core.rental_roi_enums import WINDOW_MONTHS
from app.core.tags import RENTAL_ROI_REVENUE_TAGS
from app.db.session import AsyncSessionLocal
from app.mappers import rental_roi_mapper
from app.models.properties.property_classification import PropertyClassification
from app.repositories.mortgage import mortgage_repo
from app.repositories.properties import property_repo
from app.repositories.transactions import summary_repo
from app.schemas.analytics.rental_roi_response import RentalRoiResponse
from app.services.analytics import rental_roi_math
from app.services.analytics.rental_roi_loan import RentalRoiLoan


_PERSONAL_HOME_CLASSIFICATIONS = frozenset({
    PropertyClassification.PRIMARY_RESIDENCE,
    PropertyClassification.SECOND_HOME,
})


async def get_rental_roi(
    ctx: RequestContext,
    *,
    target_return_pct: Decimal,
    today: date | None = None,
) -> RentalRoiResponse:
    today = today or date.today()
    window_start, window_end = rental_roi_math.trailing_window(today)

    async with AsyncSessionLocal() as db:
        active_properties = await property_repo.list_active(db, ctx.organization_id)
        rows = await summary_repo.txn_sum_by_property_month_and_category(
            db,
            ctx.organization_id,
            start_date=window_start,
            end_date=window_end,
            exclude_capital_improvements=True,
        )
        mortgages = await mortgage_repo.list_active_for_org(
            db, user_id=ctx.user_id, organization_id=ctx.organization_id, today=today,
        )

    rented_from = {
        p.id: rental_roi_math.rental_start(p.rented_since, p.date_placed_in_service)
        for p in active_properties
    }
    totals_by_property: dict[uuid.UUID, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    unassigned_revenue = Decimal(0)
    for row in rows:
        amount = Decimal(row.total or 0)
        if row.property_id is None:
            if row.tag in RENTAL_ROI_REVENUE_TAGS:
                unassigned_revenue += amount
            continue
        if row.property_id not in rented_from:
            continue
        # Costs and income from before a home was rented don't describe what renting it takes.
        month = date(int(row.year), int(row.month), 1)
        if month < rental_roi_math.counting_from(window_start, rented_from[row.property_id]):
            continue
        totals_by_property[row.property_id][row.tag] += amount

    loans_by_property: dict[uuid.UUID, list[RentalRoiLoan]] = defaultdict(list)
    for mortgage in mortgages:
        loans_by_property[mortgage.property_id].append(rental_roi_mapper.loan_from_mortgage(mortgage))

    rentals = sorted(
        (
            p for p in active_properties
            if p.classification == PropertyClassification.INVESTMENT
            or rental_roi_math.collects_rent(totals_by_property.get(p.id, {}))
        ),
        key=lambda p: p.name.lower(),
    )
    properties = [
        rental_roi_mapper.to_property_response(
            prop.id,
            prop.name,
            rental_roi_math.compute_property_figures(
                category_totals=totals_by_property.get(prop.id, {}),
                months=rental_roi_math.months_in_service(window_start, window_end, rented_from[prop.id]),
                loans=loans_by_property.get(prop.id, []),
                purchase_price=prop.purchase_price,
                target_return_pct=target_return_pct,
            ),
            is_personal_home=prop.classification in _PERSONAL_HOME_CLASSIFICATIONS,
        )
        for prop in rentals
    ]

    return RentalRoiResponse(
        window_start=window_start,
        window_end=window_end,
        target_return_pct=target_return_pct,
        has_transactions=bool(rows),
        unassigned_revenue_monthly_cents=rental_roi_mapper.to_cents(unassigned_revenue / WINDOW_MONTHS),
        summary=rental_roi_mapper.to_summary(properties),
        properties=properties,
    )
