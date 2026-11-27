"""Splitting one transaction across several properties."""
from typing import Final

MIN_SPLIT_SHARES: Final = 2

SPLIT_NEEDS_TWO_PROPERTIES: Final = "Pick at least two properties to split this across."
SPLIT_PROPERTY_REPEATED: Final = "Each property can only appear once in a split."
SPLIT_SHARE_NOT_POSITIVE: Final = "Every property's share has to be more than $0."
SPLIT_SHARE_NOT_CENTS: Final = "Shares are in dollars and cents, so at most two decimal places."
SPLIT_AMOUNTS_DONT_ADD_UP: Final = "The shares have to add up to the transaction's amount."
SPLIT_TOO_SMALL: Final = "This amount is too small to split that many ways."
SPLIT_NOT_FOR_TRANSFERS: Final = "A transfer between your own accounts can't be split across properties."
SPLIT_REQUEST_ONE_FORM: Final = "Send either the shares or the properties to split evenly across, not both."
SPLIT_PROPERTY_NOT_FOUND: Final = "One of those properties isn't in this workspace."
