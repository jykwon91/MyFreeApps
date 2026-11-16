"""Limits on a transaction amount written through the API."""
from decimal import Decimal

# Largest value Transaction.amount's Numeric(12, 2) column can hold.
MAX_TRANSACTION_AMOUNT = Decimal("9999999999.99")

# Same wording as the api-client's moneyInputError, so web, phone and server agree.
AMOUNT_NOT_POSITIVE = "Enter an amount above $0."
AMOUNT_TOO_PRECISE = "Use dollars and cents, like 84.20."
AMOUNT_TOO_LARGE = "That amount is too large."
AMOUNT_NEGATIVE = "Enter an amount of $0 or more."
