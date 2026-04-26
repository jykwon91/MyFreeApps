"""Analytics service — utility trend aggregation and transformation."""
import uuid
from datetime import date

from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal
from app.repositories import utility_trends_repo


def _format_period(year: int, period_num: int, granularity: str) -> str:
    """Format year + period number into a human-readable period string."""
    if granularity == "quarterly":
        return f"{year}-Q{period_num}"
    return f"{year}-{period_num:02d}"


async def get_utility_trends(
    ctx: RequestContext,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    property_ids: list[uuid.UUID] | None = None,
    granularity: str = "monthly",
) -> dict:
    org_id = ctx.organization_id
    async with AsyncSessionLocal() as db:
        trend_rows = await utility_trends_repo.get_utility_trends(
            db,
            org_id,
            start_date=start_date,
            end_date=end_date,
            property_ids=property_ids,
            granularity=granularity,
        )
        summary_rows = await utility_trends_repo.get_utility_summary(
            db,
            org_id,
            start_date=start_date,
            end_date=end_date,
            property_ids=property_ids,
        )

    trends = []
    for row in trend_rows:
        period_num = int(row.quarter) if granularity == "quarterly" else int(row.month)
        trends.append({
            "period": _format_period(int(row.year), period_num, granularity),
            "property_id": row.property_id,
            "property_name": row.property_name,
            "sub_category": row.sub_category,
            "total": float(row.total),
        })

    summary: dict[str, float] = {
        row.sub_category: float(row.total)
        for row in summary_rows
    }

    total_spend = sum(summary.values())

    return {
        "trends": trends,
        "summary": summary,
        "total_spend": total_spend,
    }
