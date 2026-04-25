from pydantic import BaseModel


class PropertySummary(BaseModel):
    property_id: str
    name: str | None
    revenue: float
    expenses: float
    profit: float


class MonthSummary(BaseModel):
    month: str
    revenue: float
    expenses: float
    profit: float


class PropertyMonthSummary(BaseModel):
    property_id: str
    name: str | None
    months: list[MonthSummary]


class SummaryResponse(BaseModel):
    revenue: float
    expenses: float
    profit: float
    by_category: dict[str, float]
    by_property: list[PropertySummary]
    by_month: list[MonthSummary]
    by_month_expense: list[dict[str, float | str]]
    by_property_month: list[PropertyMonthSummary]


class TaxPropertySummary(BaseModel):
    property_id: str
    name: str | None
    revenue: float
    expenses: float
    net_income: float


class W2Income(BaseModel):
    employer: str | None
    ein: str | None
    wages: float
    federal_withheld: float
    social_security_wages: float
    social_security_withheld: float
    medicare_wages: float
    medicare_withheld: float
    state_wages: float
    state_withheld: float


class TaxSummaryResponse(BaseModel):
    year: int
    gross_revenue: float
    total_deductions: float
    net_taxable_income: float
    by_category: dict[str, float]
    by_property: list[TaxPropertySummary]
    w2_income: list[W2Income] = []
    w2_total: float = 0
    total_income: float = 0
