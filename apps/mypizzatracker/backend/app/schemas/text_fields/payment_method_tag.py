"""A short payment tag matching pizza_order.payment_method_tag String(30), trimmed; blank is rejected."""
from typing import Annotated

from pydantic import StringConstraints

PAYMENT_METHOD_TAG_MAX_LENGTH = 30

PaymentMethodTag = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=PAYMENT_METHOD_TAG_MAX_LENGTH),
]
