"""Parse TradeSkillMaster's public region CSV into ProviderPrices.

Format (checked 2026-11-06 against the us and eu files)::

    itemId,name,marketValue,historical,avgSalePrice,saleRate,soldPerDay,updatedAt
    2589,Linen Cloth,28,28,24,0.957,7130.129,2026-11-05T14:49:31Z

Prices are copper. ``avgSalePrice`` is 0 for an item TSM has seen no sales of
(659 of 1,128 US rows on 2026-11-06) — that is "unknown", not free, so it
becomes None; the same goes for a 0 ``historical``. ``saleRate`` /
``soldPerDay`` of 0 are real measurements and stay 0. A file with only the
header parses to no prices. A row without a usable item id,
market value or time is skipped and counted — never guessed.
"""
from __future__ import annotations

import csv
import io
import logging
import math
from datetime import datetime, timezone

from app.services.wow.prices.price_fetch_error import PriceFetchError
from app.services.wow.prices.provider_price import ProviderPrice

logger = logging.getLogger(__name__)

TSM_COLUMNS = ("itemId", "name", "marketValue", "historical", "avgSalePrice", "saleRate", "soldPerDay", "updatedAt")


def _copper(raw: str | None) -> int | None:
    """A price cell -> whole copper, or None when empty / not a number / negative."""
    if raw is None or not raw.strip():
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return round(value)


def _optional_price(raw: str | None) -> int | None:
    value = _copper(raw)
    return None if value == 0 else value


def _rate(raw: str | None) -> float | None:
    if raw is None or not raw.strip():
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if math.isfinite(value) and value >= 0 else None


def _time(raw: str | None) -> datetime | None:
    if raw is None or not raw.strip():
        return None
    try:
        parsed = datetime.fromisoformat(raw.strip())
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _row_price(row: dict[str, str]) -> ProviderPrice | None:
    raw_id = (row.get("itemId") or "").strip()
    market_value = _copper(row.get("marketValue"))
    updated_at = _time(row.get("updatedAt"))
    if not raw_id.isdigit() or int(raw_id) <= 0 or market_value is None or updated_at is None:
        return None
    return ProviderPrice(
        item_id=int(raw_id),
        name=(row.get("name") or "").strip()[:200],
        market_value=market_value,
        historical=_optional_price(row.get("historical")),
        avg_sale_price=_optional_price(row.get("avgSalePrice")),
        sale_rate=_rate(row.get("saleRate")),
        sold_per_day=_rate(row.get("soldPerDay")),
        source_updated_at=updated_at,
    )


def parse_tsm_csv(text: str) -> list[ProviderPrice]:
    """Every usable row, one per item id (a repeated id keeps its last row).

    Raises ``PriceFetchError`` when the header isn't TSM's — a changed format
    must never be read as "no prices".
    """
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    header = tuple(reader.fieldnames or ())
    missing = [column for column in TSM_COLUMNS if column not in header]
    if missing:
        raise PriceFetchError(f"TSM CSV header changed: missing {missing}, got {list(header)}")

    by_id: dict[int, ProviderPrice] = {}
    skipped = 0
    for row in reader:
        price = _row_price(row)
        if price is None:
            skipped += 1
            continue
        by_id[price.item_id] = price
    if skipped:
        logger.warning("tsm_csv: skipped %d row(s) without an item id, market value or time", skipped)
    return list(by_id.values())
