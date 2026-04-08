import uuid
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.pii import mask_pii
from app.core.tags import REVENUE_TAGS, EXPENSE_TAGS
from app.db.session import AsyncSessionLocal
from app.repositories import summary_repo, tax_return_repo

# Nested dict value types for summary data structures
_PropertySummaryDict = dict[str, str | float | None]
_MonthSummaryDict = dict[str, str | float]
_PropertyMonthDict = dict[str, str | None | list[dict[str, str | float]]]

SummaryData = dict[
    str,
    float
    | dict[str, float]
    | list[_PropertySummaryDict | _MonthSummaryDict | _PropertyMonthDict],
]
TaxSummaryData = dict[
    str,
    int
    | float
    | dict[str, float]
    | list[_PropertySummaryDict]
    | list[dict[str, object]],
]


async def get_summary(
    ctx: RequestContext,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    property_ids: list[uuid.UUID] | None = None,
) -> SummaryData:
    org_id = ctx.organization_id
    async with AsyncSessionLocal() as db:
        rows = list(await summary_repo.txn_sum_by_category(
            db, org_id, start_date=start_date, end_date=end_date, property_ids=property_ids,
        ))
        prop_rows = list(await summary_repo.txn_sum_by_property_and_category(
            db, org_id, start_date=start_date, end_date=end_date, property_ids=property_ids,
        ))
        month_rows = list(await summary_repo.txn_sum_by_month_and_category(
            db, org_id, start_date=start_date, end_date=end_date, property_ids=property_ids,
        ))
        prop_month_rows = list(await summary_repo.txn_sum_by_property_month_and_category(
            db, org_id, start_date=start_date, end_date=end_date, property_ids=property_ids,
        ))

    by_tag: dict[str, float] = {row.tag: float(row.total) for row in rows}
    revenue = sum(v for k, v in by_tag.items() if k in REVENUE_TAGS)
    expenses = sum(v for k, v in by_tag.items() if k in EXPENSE_TAGS)

    property_data: dict[str, dict[str, str | float | None]] = defaultdict(
        lambda: {"name": None, "revenue": 0.0, "expenses": 0.0}
    )
    for row in prop_rows:
        pid = str(row.property_id) if row.property_id else "unassigned"
        property_data[pid]["name"] = row.property_name or "Unassigned"
        amount = float(row.total)
        if row.tag in REVENUE_TAGS:
            property_data[pid]["revenue"] = float(property_data[pid]["revenue"] or 0) + amount
        elif row.tag in EXPENSE_TAGS:
            property_data[pid]["expenses"] = float(property_data[pid]["expenses"] or 0) + amount

    by_property = sorted(
        [
            {
                "property_id": pid,
                "name": data["name"],
                "revenue": data["revenue"],
                "expenses": data["expenses"],
                "profit": float(data["revenue"] or 0) - float(data["expenses"] or 0),
            }
            for pid, data in property_data.items()
        ],
        key=lambda x: float(x["profit"]),
        reverse=True,
    )

    monthly_data: dict[str, dict[str, float]] = defaultdict(lambda: {"revenue": 0.0, "expenses": 0.0})
    for row in month_rows:
        key = f"{int(row.year)}-{int(row.month):02d}"
        amount = float(row.total)
        if row.tag in REVENUE_TAGS:
            monthly_data[key]["revenue"] += amount
        elif row.tag in EXPENSE_TAGS:
            monthly_data[key]["expenses"] += amount

    by_month = [
        {"month": key, "revenue": data["revenue"], "expenses": data["expenses"], "profit": data["revenue"] - data["expenses"]}
        for key, data in sorted(monthly_data.items())
    ]

    expense_by_month: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for row in month_rows:
        if row.tag in EXPENSE_TAGS:
            key = f"{int(row.year)}-{int(row.month):02d}"
            expense_by_month[key][row.tag] += float(row.total)

    by_month_expense = [
        {"month": key, **cats}
        for key, cats in sorted(expense_by_month.items())
    ]

    prop_monthly: dict[str, dict[str, str | None | dict[str, dict[str, float]]]] = defaultdict(
        lambda: {"name": None, "months": defaultdict(lambda: {"revenue": 0.0, "expenses": 0.0})}
    )
    for row in prop_month_rows:
        pid = str(row.property_id)
        prop_monthly[pid]["name"] = row.property_name
        key = f"{int(row.year)}-{int(row.month):02d}"
        amount = float(row.total)
        months = prop_monthly[pid]["months"]
        if isinstance(months, dict):
            if row.tag in REVENUE_TAGS:
                months[key]["revenue"] += amount
            elif row.tag in EXPENSE_TAGS:
                months[key]["expenses"] += amount

    by_property_month = [
        {
            "property_id": pid,
            "name": data["name"],
            "months": [
                {"month": m, "revenue": v["revenue"], "expenses": v["expenses"], "profit": v["revenue"] - v["expenses"]}
                for m, v in sorted(data["months"].items())
            ] if isinstance(data["months"], dict) else [],
        }
        for pid, data in prop_monthly.items()
    ]

    return {
        "revenue": revenue,
        "expenses": expenses,
        "profit": revenue - expenses,
        "by_category": by_tag,
        "by_property": by_property,
        "by_month": by_month,
        "by_month_expense": by_month_expense,
        "by_property_month": by_property_month,
    }


async def get_tax_summary(
    ctx: RequestContext, year: int,
) -> TaxSummaryData:
    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end = datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc)

    async with AsyncSessionLocal() as db:
        rows = await summary_repo.txn_sum_by_category(
            db, ctx.organization_id, start_date=start, end_date=end, tax_relevant_only=True,
        )
        prop_rows = await summary_repo.txn_sum_by_property_and_category(
            db, ctx.organization_id, start_date=start, end_date=end, tax_relevant_only=True,
        )
        by_tag: dict[str, float] = {row.tag: float(row.total) for row in rows}

        revenue = sum(v for k, v in by_tag.items() if k in REVENUE_TAGS)
        deductions = sum(v for k, v in by_tag.items() if k in EXPENSE_TAGS)

        property_data: dict[str, dict[str, str | float | None]] = defaultdict(
            lambda: {"name": None, "revenue": 0.0, "expenses": 0.0}
        )
        for row in prop_rows:
            pid = str(row.property_id) if row.property_id else "unassigned"
            property_data[pid]["name"] = row.property_name or "Unassigned"
            amount = float(row.total)
            if row.tag in REVENUE_TAGS:
                property_data[pid]["revenue"] = float(property_data[pid]["revenue"] or 0) + amount
            elif row.tag in EXPENSE_TAGS:
                property_data[pid]["expenses"] = float(property_data[pid]["expenses"] or 0) + amount

        by_property = sorted(
            [
                {
                    "property_id": pid,
                    "name": data["name"],
                    "revenue": data["revenue"],
                    "expenses": data["expenses"],
                    "net_income": float(data["revenue"] or 0) - float(data["expenses"] or 0),
                }
                for pid, data in property_data.items()
            ],
            key=lambda x: float(x["net_income"]),
            reverse=True,
        )

        # Fetch W-2 income from tax form instances
        w2_items = await _build_w2_income(db, ctx.organization_id, year)
        w2_total = sum(w["wages"] for w in w2_items)

        return {
            "year": year,
            "gross_revenue": revenue,
            "total_deductions": deductions,
            "net_taxable_income": revenue - deductions,
            "by_category": by_tag,
            "by_property": by_property,
            "w2_income": w2_items,
            "w2_total": w2_total,
            "total_income": revenue + w2_total,
        }


async def _build_w2_income(
    db: AsyncSession, organization_id: uuid.UUID, year: int,
) -> list[dict[str, object]]:
    """Build W-2 income summary dicts from tax form instances for a given year."""
    instances = await tax_return_repo.get_w2_instances_with_fields(db, organization_id, year)
    w2_items: list[dict[str, object]] = []
    for inst in instances:
        fields = {
            f.field_id: f.value_numeric
            for f in inst.fields
            if f.value_numeric is not None
        }
        w2_items.append({
            "employer": inst.issuer_name,
            "ein": str(mask_pii("issuer_ein", inst.issuer_ein)) if inst.issuer_ein else None,
            "wages": float(fields.get("box_1", 0)),
            "federal_withheld": float(fields.get("box_2", 0)),
            "social_security_wages": float(fields.get("box_3", 0)),
            "social_security_withheld": float(fields.get("box_4", 0)),
            "medicare_wages": float(fields.get("box_5", 0)),
            "medicare_withheld": float(fields.get("box_6", 0)),
            "state_wages": float(fields.get("box_16", 0)),
            "state_withheld": float(fields.get("box_17", 0)),
        })
    return w2_items
