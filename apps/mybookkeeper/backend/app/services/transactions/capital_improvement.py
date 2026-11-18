from datetime import date


def placed_in_service_date_for(
    is_capital_improvement: bool,
    placed_in_service_date: date | None,
    transaction_date: date,
) -> date | None:
    """The date a transaction should carry; the table requires one on a capital improvement."""
    if not is_capital_improvement:
        return None
    return placed_in_service_date or transaction_date
