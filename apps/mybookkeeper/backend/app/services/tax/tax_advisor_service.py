"""AI Tax Advisor — assembles user tax data and asks Claude for suggestions."""
import json
import logging
import uuid
from decimal import Decimal
from typing import TypedDict

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, unit_of_work
from app.mappers import tax_advisor_mapper
from app.models.tax.tax_advisor_generation import TaxAdvisorGeneration
from app.models.tax.tax_advisor_suggestion import TaxAdvisorSuggestion
from app.models.tax.tax_return import TaxReturn
from app.repositories import property_repo, booking_statement_repo, tax_return_repo, transaction_repo, usage_log_repo
from app.repositories.organization import tax_profile_repo
from app.repositories.tax import cost_basis_lot_repo, tax_advisor_repo
from app.schemas.tax.tax_advisor import TaxAdvisorCachedResponse
from app.services.tax import tax_advisor_claude, tax_validation_service
from app.services.tax.tax_advisor_persistence import save_advice
from app.services.tax.tax_advisor_response_parser import parse_advisor_response
from app.core.tax_advisor_disclaimer import HARDCODED_DISCLAIMER

logger = logging.getLogger(__name__)

MAX_ADVISOR_CALLS_PER_RETURN_PER_DAY = 5
MODEL_VERSION = "claude-sonnet-4-6"


class _DecimalEncoder(json.JSONEncoder):
    def default(self, o: object) -> object:
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


class _PropertyData(TypedDict):
    id: str
    name: str
    address: str | None
    type: str | None
    purchase_price: float | None
    land_value: float | None
    date_placed_in_service: str | None
    property_class: str | None
    personal_use_days: int | None


class _ScheduleEEntry(TypedDict):
    property_id: str | None
    property_label: str | None
    fields: dict[str, float]


class _UnassignedExpense(TypedDict):
    id: str
    date: str
    vendor: str | None
    amount: float
    category: str | None
    description: str | None
    is_capital_improvement: bool | None


class _TaxFormEntry(TypedDict):
    form_name: str
    instance_label: str | None
    issuer_ein: str | None
    issuer_name: str | None
    property_id: str | None
    fields: dict[str, float | str | bool]


class _ReservationSummaryEntry(TypedDict):
    property_id: str | None
    platform: str | None
    total_reservations: int
    total_nights: int
    total_gross: float
    total_net: float


class _SummaryData(TypedDict):
    total_rental_revenue: float
    total_rental_expenses: float
    net_rental_income: float
    w2_wages: float
    agi_estimate: float


class _InvestmentSummary(TypedDict):
    total_short_term_gains: float
    total_long_term_gains: float
    total_short_term_losses: float
    total_long_term_losses: float
    lot_count: int


class _TaxDataPayload(TypedDict):
    tax_year: int
    filing_status: str
    taxpayer_profile: list[str]  # tax_situations from TaxProfile
    properties: list[_PropertyData]
    schedule_e: list[_ScheduleEEntry]
    unassigned_expenses: list[_UnassignedExpense]
    tax_forms: list[_TaxFormEntry]
    reservation_summary: list[_ReservationSummaryEntry]
    investment_summary: _InvestmentSummary | None
    summary: _SummaryData
    known_issues: list[dict[str, str | None]]


async def generate_advice(
    organization_id: uuid.UUID,
    tax_return_id: uuid.UUID,
    user_id: uuid.UUID,
) -> TaxAdvisorCachedResponse:
    """Assemble tax data, call Claude, persist results, and return cached response."""
    async with unit_of_work() as db:
        tax_return = await tax_return_repo.get_by_id(db, tax_return_id, organization_id)
        if not tax_return:
            raise LookupError("Tax return not found")

        await _check_rate_limit(db, organization_id, tax_return_id, user_id)

        tax_data = await _assemble_tax_data(db, tax_return)

    message = await tax_advisor_claude.ask_tax_advisor(
        model=MODEL_VERSION, tax_data_json=json.dumps(tax_data, cls=_DecimalEncoder, indent=2),
    )
    first_block = message.content[0]
    raw_text = first_block.text.strip() if isinstance(first_block, anthropic.types.TextBlock) else ""
    input_tokens: int | None = message.usage.input_tokens if message.usage else None
    output_tokens: int | None = message.usage.output_tokens if message.usage else None

    advisor_response = parse_advisor_response(raw_text)

    async with unit_of_work() as db:
        saved_generation, suggestion_models = await save_advice(
            db,
            organization_id=organization_id,
            tax_return_id=tax_return_id,
            user_id=user_id,
            suggestions=advisor_response.suggestions,
            model_version=MODEL_VERSION,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

    return _map_to_cached_response(saved_generation, suggestion_models)


async def get_cached_advice(
    organization_id: uuid.UUID,
    tax_return_id: uuid.UUID,
) -> TaxAdvisorCachedResponse | None:
    """Read persisted suggestions from DB. Returns None if no generation exists.

    Raises LookupError when the tax return is not in the caller's organization.
    """
    async with AsyncSessionLocal() as db:
        if not await tax_return_repo.get_by_id(db, tax_return_id, organization_id):
            raise LookupError("Tax return not found")

        suggestions = await tax_advisor_repo.list_active_for_return(db, tax_return_id, organization_id)
        generation = await tax_advisor_repo.get_latest_generation(db, tax_return_id, organization_id)

    if not generation:
        return None
    return TaxAdvisorCachedResponse(
        suggestions=[tax_advisor_mapper.to_suggestion_read(s) for s in suggestions],
        disclaimer=HARDCODED_DISCLAIMER,
        generated_at=generation.created_at,
        model_version=generation.model_version,
    )


async def update_suggestion_status(
    organization_id: uuid.UUID,
    suggestion_id: uuid.UUID,
    status: str,
    user_id: uuid.UUID,
) -> TaxAdvisorSuggestion | None:
    """Update the status of a suggestion. Returns None if not found."""
    async with unit_of_work() as db:
        return await tax_advisor_repo.update_suggestion_status(
            db, suggestion_id, organization_id, status, user_id,
        )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

async def _check_rate_limit(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_return_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Enforce max advisor calls per tax return per day using usage_logs."""
    file_type_tag = f"tax_advisor:{tax_return_id}"
    count = await usage_log_repo.count_for_file_type_today(db, organization_id, file_type_tag)

    if count >= MAX_ADVISOR_CALLS_PER_RETURN_PER_DAY:
        raise RateLimitExceeded(
            f"Maximum {MAX_ADVISOR_CALLS_PER_RETURN_PER_DAY} advisor calls "
            f"per tax return per day exceeded"
        )

    await usage_log_repo.add_entry(db, organization_id, user_id, file_type_tag)


async def _assemble_tax_data(
    db: AsyncSession,
    tax_return: TaxReturn,
) -> _TaxDataPayload:
    """Load all relevant data for the tax year and assemble into a typed dict."""
    org_id = tax_return.organization_id
    tax_year = tax_return.tax_year

    properties = await _load_properties(db, org_id)
    schedule_e = await _load_schedule_e(db, tax_return)
    unassigned = await _load_unassigned_expenses(db, org_id, tax_year)
    tax_forms = await _load_tax_forms(db, tax_return)
    reservation_summary = await _load_reservation_summary(db, org_id, tax_year)
    investment_summary = await _load_investment_summary(db, org_id, tax_year)
    taxpayer_profile = await _load_taxpayer_profile(db, org_id)
    summary = _build_summary(schedule_e, tax_forms)
    known_issues = await _load_known_issues(org_id, tax_return.id)

    return _TaxDataPayload(
        tax_year=tax_year,
        filing_status=tax_return.filing_status,
        taxpayer_profile=taxpayer_profile,
        properties=properties,
        schedule_e=schedule_e,
        unassigned_expenses=unassigned,
        tax_forms=tax_forms,
        reservation_summary=reservation_summary,
        investment_summary=investment_summary,
        summary=summary,
        known_issues=known_issues,
    )


async def _load_taxpayer_profile(
    db: AsyncSession, organization_id: uuid.UUID,
) -> list[str]:
    """Load tax situations from TaxProfile for profile-driven deduction rules."""
    profile = await tax_profile_repo.get_by_org(db, organization_id)
    if not profile or not profile.tax_situations:
        return []
    return list(profile.tax_situations)


async def _load_investment_summary(
    db: AsyncSession, organization_id: uuid.UUID, tax_year: int,
) -> _InvestmentSummary | None:
    """Summarize capital gains/losses from CostBasisLot records."""
    lots = await cost_basis_lot_repo.list_for_org_year(db, organization_id, tax_year)
    if not lots:
        return None

    st_gains = st_losses = lt_gains = lt_losses = Decimal("0")
    for lot in lots:
        gl = lot.gain_loss or Decimal("0")
        is_short = lot.holding_period == "short_term"
        if gl >= 0:
            if is_short:
                st_gains += gl
            else:
                lt_gains += gl
        else:
            if is_short:
                st_losses += gl
            else:
                lt_losses += gl

    return _InvestmentSummary(
        total_short_term_gains=float(st_gains),
        total_long_term_gains=float(lt_gains),
        total_short_term_losses=float(st_losses),
        total_long_term_losses=float(lt_losses),
        lot_count=len(lots),
    )


async def _load_properties(
    db: AsyncSession, organization_id: uuid.UUID,
) -> list[_PropertyData]:
    properties = await property_repo.list_active(db, organization_id)

    return [
        _PropertyData(
            id=str(p.id),
            name=p.name,
            address=p.address,
            type=p.type.value if p.type else None,
            purchase_price=float(p.purchase_price) if p.purchase_price else None,
            land_value=float(p.land_value) if p.land_value else None,
            date_placed_in_service=str(p.date_placed_in_service) if p.date_placed_in_service else None,
            property_class=p.property_class,
            personal_use_days=p.personal_use_days,
        )
        for p in properties
    ]


async def _load_schedule_e(
    db: AsyncSession, tax_return: TaxReturn,
) -> list[_ScheduleEEntry]:
    """Load computed Schedule E data per property."""
    instances = await tax_return_repo.get_form_instances(
        db, tax_return.id, "schedule_e",
    )

    schedule_e_data: list[_ScheduleEEntry] = []
    for inst in instances:
        fields: dict[str, float] = {}
        for f in inst.fields:
            if f.value_numeric is not None:
                fields[f.field_id] = float(f.value_numeric)

        schedule_e_data.append(_ScheduleEEntry(
            property_id=str(inst.property_id) if inst.property_id else None,
            property_label=inst.instance_label,
            fields=fields,
        ))

    return schedule_e_data


async def _load_unassigned_expenses(
    db: AsyncSession, organization_id: uuid.UUID, tax_year: int,
) -> list[_UnassignedExpense]:
    transactions = await transaction_repo.list_unassigned_tax_relevant(
        db, organization_id, tax_year
    )

    return [
        _UnassignedExpense(
            id=str(t.id),
            date=str(t.transaction_date),
            vendor=t.vendor,
            amount=float(t.amount),
            category=t.category,
            description=t.description,
            is_capital_improvement=t.is_capital_improvement,
        )
        for t in transactions
    ]


async def _load_tax_forms(
    db: AsyncSession, tax_return: TaxReturn,
) -> list[_TaxFormEntry]:
    """Load all non-computed form instances with their field values."""
    all_instances = await tax_return_repo.get_all_form_instances(db, tax_return.id)

    forms: list[_TaxFormEntry] = []
    for inst in all_instances:
        if inst.source_type == "computed":
            continue

        fields: dict[str, float | str | bool] = {}
        for f in inst.fields:
            if f.value_numeric is not None:
                fields[f.field_id] = float(f.value_numeric)
            elif f.value_text is not None:
                fields[f.field_id] = f.value_text
            elif f.value_boolean is not None:
                fields[f.field_id] = f.value_boolean

        forms.append(_TaxFormEntry(
            form_name=inst.form_name,
            instance_label=inst.instance_label,
            issuer_ein=inst.issuer_ein,
            issuer_name=inst.issuer_name,
            property_id=str(inst.property_id) if inst.property_id else None,
            fields=fields,
        ))

    return forms


async def _load_reservation_summary(
    db: AsyncSession, organization_id: uuid.UUID, tax_year: int,
) -> list[_ReservationSummaryEntry]:
    """Summarize reservation nights and revenue per property."""
    rows = await booking_statement_repo.summary_by_property_platform(db, organization_id, tax_year)

    return [
        _ReservationSummaryEntry(
            property_id=str(row.property_id) if row.property_id else None,
            platform=row.platform,
            total_reservations=row.total_reservations,
            total_nights=int(row.total_nights) if row.total_nights else 0,
            total_gross=float(row.total_gross) if row.total_gross else 0,
            total_net=float(row.total_net) if row.total_net else 0,
        )
        for row in rows
    ]


def _build_summary(
    schedule_e: list[_ScheduleEEntry],
    tax_forms: list[_TaxFormEntry],
) -> _SummaryData:
    """Build high-level summary from already-loaded data."""
    total_rental_revenue = Decimal("0")
    total_expenses = Decimal("0")
    for se in schedule_e:
        fields = se.get("fields", {})
        total_rental_revenue += Decimal(str(fields.get("line_3", 0)))
        total_expenses += Decimal(str(fields.get("line_20", 0)))

    w2_wages = Decimal("0")
    for form in tax_forms:
        if form["form_name"] == "w2":
            box_1 = form.get("fields", {}).get("box_1", 0)
            w2_wages += Decimal(str(box_1))

    agi_estimate = float(w2_wages + total_rental_revenue - total_expenses)

    return _SummaryData(
        total_rental_revenue=float(total_rental_revenue),
        total_rental_expenses=float(total_expenses),
        net_rental_income=float(total_rental_revenue - total_expenses),
        w2_wages=float(w2_wages),
        agi_estimate=agi_estimate,
    )


async def _load_known_issues(
    organization_id: uuid.UUID,
    tax_return_id: uuid.UUID,
) -> list[dict[str, str | None]]:
    """Load validation results as known issues."""
    try:
        results = await tax_validation_service.validate(organization_id, tax_return_id)
    except LookupError:
        return []

    return [
        {
            "severity": r.severity,
            "form_name": r.form_name,
            "field_id": r.field_id,
            "message": r.message,
        }
        for r in results
    ]


def _map_to_cached_response(
    generation: TaxAdvisorGeneration,
    suggestions: list[TaxAdvisorSuggestion],
) -> TaxAdvisorCachedResponse:
    return TaxAdvisorCachedResponse(
        suggestions=[tax_advisor_mapper.to_suggestion_read(s) for s in suggestions],
        disclaimer=HARDCODED_DISCLAIMER,
        generated_at=generation.created_at,
        model_version=generation.model_version,
    )


class RateLimitExceeded(Exception):
    pass
