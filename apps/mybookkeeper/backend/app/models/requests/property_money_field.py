from decimal import Decimal
from typing import Annotated

from pydantic import Field

# Matches the Numeric(12, 2) money columns on properties (purchase_price, land_value).
PropertyMoney = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
