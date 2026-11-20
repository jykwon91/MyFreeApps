"""A property's depreciation inputs: what Form 4562, and so Schedule E line 18, is computed from."""

# Changing any of these moves an unfiled return's depreciation.
DEPRECIATION_INPUT_FIELDS: frozenset[str] = frozenset({
    "purchase_price", "land_value", "date_placed_in_service", "property_class", "is_active",
})

# Same wording as the web and phone edit screens (api-client constants/depreciationInputs.ts).
LAND_VALUE_OVER_PRICE = "Land value can't be more than the purchase price."
LAND_VALUE_NEEDS_PRICE = "Enter the purchase price before the land value."
PLACED_IN_SERVICE_IN_FUTURE = "The date placed in service can't be in the future."
