"""Payee rules: how a rule files the payments it matches."""
from typing import Final

# A rule splits across at most this many properties.
MAX_RULE_SPLIT_PROPERTIES: Final = 20
# "Apply to past payments" looks at no more than this many rows at once.
MAX_PAST_MATCHES: Final = 5000

RULE_SPLIT_NEEDS_TWO: Final = "Pick at least two properties to split across, or pick one property."
RULE_SPLIT_OR_PROPERTY: Final = "Pick one property or properties to split across, not both."
RULE_SPLIT_PROPERTY_REPEATED: Final = "Each property can only appear once in a split."
RULE_PERSONAL_NO_PROPERTY: Final = "Personal spending isn't filed under a property."
RULE_PROPERTY_NOT_FOUND: Final = "One of those properties isn't in this workspace."
RULE_PAST_ONLY_PAYEES: Final = "Only a payee rule can be applied to past payments."
RULE_NOT_FOUND: Final = "Classification rule not found"
