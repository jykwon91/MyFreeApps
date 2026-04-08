"""Maps extraction output for 1099-B / stock trade documents into CostBasisLot records."""
import re
import uuid
from decimal import Decimal

from app.core.parsers import safe_date, safe_decimal
from app.mappers.extraction_mapper import MappedItem
from app.models.tax.cost_basis_lot import CostBasisLot


def build_cost_basis_lot_from_mapped_item(
    item: MappedItem,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    extraction_id: uuid.UUID,
) -> CostBasisLot | None:
    """Build a CostBasisLot from a MappedItem with document_type 1099_b."""
    raw = item.raw_data or {}
    fields = raw.get("tax_form_data", {}).get("fields", {}) if raw.get("tax_form_data") else {}

    # If no structured tax_form_data, try to build from flat fields
    if not fields:
        # Fall back to raw extraction fields for CSV rows
        proceeds = safe_decimal(raw.get("amount") or raw.get("proceeds"))
        cost_basis = safe_decimal(raw.get("cost_basis"))
        if proceeds is None and cost_basis is None:
            return None

        asset_name = raw.get("vendor") or raw.get("description") or "Unknown Asset"
        acquisition_date = safe_date(raw.get("acquisition_date") or raw.get("date"))
        sale_date = safe_date(raw.get("sale_date") or raw.get("date"))
        tax_year = sale_date.year if sale_date else (item.date.year if item.date else 2025)

        return CostBasisLot(
            organization_id=organization_id,
            user_id=user_id,
            extraction_id=extraction_id,
            asset_name=asset_name,
            asset_type=_infer_asset_type(asset_name),
            ticker=_extract_ticker(asset_name),
            shares=safe_decimal(raw.get("shares")) or Decimal("1"),
            cost_basis=cost_basis or Decimal("0"),
            acquisition_date=acquisition_date or sale_date,
            sale_date=sale_date,
            proceeds=proceeds,
            gain_loss=_calc_gain_loss(proceeds, cost_basis),
            tax_year=tax_year,
            holding_period=_normalize_holding_period(raw.get("holding_period")),
        )

    # Structured 1099-B box values
    description = str(fields.get("box_1a", "") or "")
    acquisition_date = safe_date(fields.get("box_1b"))
    sale_date = safe_date(fields.get("box_1c"))
    proceeds = safe_decimal(fields.get("box_1d"))
    cost_basis = safe_decimal(fields.get("box_1e"))
    holding = fields.get("box_2")

    if proceeds is None and cost_basis is None:
        return None

    asset_name = description or item.vendor or "Unknown Asset"
    shares_parsed = _parse_shares_from_description(description)
    tax_year = sale_date.year if sale_date else (item.date.year if item.date else 2025)

    return CostBasisLot(
        organization_id=organization_id,
        user_id=user_id,
        extraction_id=extraction_id,
        asset_name=asset_name,
        asset_type=_infer_asset_type(asset_name),
        ticker=_extract_ticker(asset_name),
        shares=shares_parsed or Decimal("1"),
        cost_basis=cost_basis or Decimal("0"),
        acquisition_date=acquisition_date or sale_date,
        sale_date=sale_date,
        proceeds=proceeds,
        gain_loss=_calc_gain_loss(proceeds, cost_basis),
        tax_year=tax_year,
        holding_period=_normalize_holding_period(holding),
    )


def _calc_gain_loss(proceeds: Decimal | None, cost_basis: Decimal | None) -> Decimal | None:
    if proceeds is not None and cost_basis is not None:
        return proceeds - cost_basis
    return None


def _parse_shares_from_description(desc: str) -> Decimal | None:
    """Try to parse share count from description like '100 shares of AAPL'."""
    match = re.search(r"([\d,.]+)\s*(?:shares?|sh|units?)", desc, re.IGNORECASE)
    if match:
        return safe_decimal(match.group(1).replace(",", ""))
    return None


_CRYPTO_KEYWORDS = frozenset({"btc", "eth", "bitcoin", "ethereum", "crypto", "sol", "doge", "ada", "xrp"})
_ETF_SUFFIXES = frozenset({"etf", "fund", "index", "trust"})


def _infer_asset_type(name: str) -> str:
    lower = name.lower()
    if any(kw in lower for kw in _CRYPTO_KEYWORDS):
        return "crypto"
    if any(kw in lower for kw in _ETF_SUFFIXES):
        return "etf"
    return "stock"


def _extract_ticker(name: str) -> str | None:
    """Try to find a stock ticker in the asset name."""
    match = re.search(r"\b([A-Z]{1,5})\b", name)
    return match.group(1) if match else None


def _normalize_holding_period(value: str | None) -> str | None:
    if not value:
        return None
    lower = str(value).lower()
    if "short" in lower:
        return "short_term"
    if "long" in lower:
        return "long_term"
    return None
