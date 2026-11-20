"""Derives Form 4562 depreciation, one form per depreciable rental property."""
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.property import Property
from app.models.tax.property_depreciation import PropertyDepreciation
from app.models.tax.tax_return import TaxReturn
from app.repositories import property_repo, tax_return_repo

DEPRECIATION_AMOUNT_FIELD = "depreciation_amount"
DEPRECIATION_AMOUNT_LABEL = "Annual depreciation"
DEPRECIABLE_BASIS_FIELD = "depreciable_basis"
DEPRECIABLE_BASIS_LABEL = "Depreciable basis (cost minus land)"
USEFUL_LIFE_FIELD = "useful_life_years"
USEFUL_LIFE_LABEL = "Recovery period (years)"


def _annual_depreciation(prop: Property, tax_year: int) -> tuple[Decimal, Decimal, Decimal] | None:
    """(depreciation, basis, recovery years) for ``tax_year``, or None when nothing is depreciated that year.

    Straight line over 27.5 or 39 years with the mid-month convention.
    """
    useful_life = Decimal("27.5")
    if prop.property_class == "commercial_39":
        useful_life = Decimal("39")

    land = prop.land_value or Decimal("0")
    depreciable_basis = prop.purchase_price - land
    if depreciable_basis <= 0:
        return None

    annual_rate = depreciable_basis / useful_life
    start_year = prop.date_placed_in_service.year
    start_month = prop.date_placed_in_service.month

    if tax_year < start_year:
        return None

    total_months = int(useful_life * 12)
    end_year = start_year + (total_months + start_month - 2) // 12

    if tax_year > end_year:
        return None

    if tax_year == start_year:
        months_in_service = Decimal(12 - start_month) + Decimal("0.5")
        annual_depreciation = (annual_rate * months_in_service / 12).quantize(Decimal("0.01"))
    elif tax_year == end_year:
        prior_total = Decimal("0")
        for y in range(start_year, end_year):
            if y == start_year:
                m = Decimal(12 - start_month) + Decimal("0.5")
                prior_total += (annual_rate * m / 12).quantize(Decimal("0.01"))
            else:
                prior_total += annual_rate.quantize(Decimal("0.01"))
        annual_depreciation = (depreciable_basis - prior_total).quantize(Decimal("0.01"))
        if annual_depreciation < 0:
            annual_depreciation = Decimal("0")
    else:
        annual_depreciation = annual_rate.quantize(Decimal("0.01"))

    return annual_depreciation, depreciable_basis, useful_life


async def compute_form_4562(
    db: AsyncSession, tax_return: TaxReturn,
) -> dict[uuid.UUID, PropertyDepreciation]:
    """Write each depreciable property's Form 4562 and return what it claims, by property.

    The amount returned is what the form ends up saying, so an override on it carries
    through to Schedule E. A property that no longer depreciates this year (reclassified,
    sold, fully depreciated) has its earlier computed figures cleared, except any the
    user overrode; an overridden amount is still returned so it reaches line 18.
    """
    properties = await property_repo.list_depreciable(db, tax_return.organization_id)

    claimed: dict[uuid.UUID, PropertyDepreciation] = {}
    for prop in properties:
        computed = _annual_depreciation(prop, tax_return.tax_year)
        if computed is None:
            continue
        annual_depreciation, depreciable_basis, useful_life = computed

        instance = await tax_return_repo.upsert_form_instance(
            db, tax_return.id, "form_4562", "computed",
            property_id=prop.id, instance_label=prop.address or prop.name,
        )
        amount_field = await tax_return_repo.upsert_field(
            db, instance.id, DEPRECIATION_AMOUNT_FIELD, DEPRECIATION_AMOUNT_LABEL,
            value_numeric=annual_depreciation, is_calculated=True,
        )
        await tax_return_repo.upsert_field(
            db, instance.id, DEPRECIABLE_BASIS_FIELD, DEPRECIABLE_BASIS_LABEL,
            value_numeric=depreciable_basis, is_calculated=True,
        )
        await tax_return_repo.upsert_field(
            db, instance.id, USEFUL_LIFE_FIELD, USEFUL_LIFE_LABEL,
            value_numeric=useful_life, is_calculated=True,
        )
        claimed[prop.id] = PropertyDepreciation(
            form_instance_id=instance.id,
            amount=amount_field.value_numeric or Decimal("0"),
        )

    saved = await tax_return_repo.get_form_instances(db, tax_return.id, "form_4562")
    for instance in saved:
        if instance.source_type != "computed" or instance.property_id is None:
            continue
        if instance.property_id in claimed:
            continue
        amount_field = await tax_return_repo.upsert_field(
            db, instance.id, DEPRECIATION_AMOUNT_FIELD, DEPRECIATION_AMOUNT_LABEL,
            value_numeric=Decimal("0"), is_calculated=True,
        )
        await tax_return_repo.upsert_field(
            db, instance.id, DEPRECIABLE_BASIS_FIELD, DEPRECIABLE_BASIS_LABEL,
            value_numeric=None, is_calculated=True,
        )
        await tax_return_repo.upsert_field(
            db, instance.id, USEFUL_LIFE_FIELD, USEFUL_LIFE_LABEL,
            value_numeric=None, is_calculated=True,
        )
        if amount_field.is_overridden:
            claimed[instance.property_id] = PropertyDepreciation(
                form_instance_id=instance.id,
                amount=amount_field.value_numeric or Decimal("0"),
            )

    return claimed
