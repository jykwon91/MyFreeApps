"""A menu price (pizza price, topping price delta): non-negative, matches Numeric(10, 2).

$0.00 is valid -- free toppings are allowed. More than two decimals is rejected
rather than silently rounded by the column, so customers never see a price the
owner did not type.
"""
from decimal import Decimal
from typing import Annotated

from pydantic import Field

MENU_PRICE_MAX_DIGITS = 10
MENU_PRICE_DECIMAL_PLACES = 2

MenuPrice = Annotated[
    Decimal,
    Field(ge=0, max_digits=MENU_PRICE_MAX_DIGITS, decimal_places=MENU_PRICE_DECIMAL_PLACES),
]
