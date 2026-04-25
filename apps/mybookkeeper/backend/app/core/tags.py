UTILITY_SUB_CATEGORIES = frozenset({
    "electricity", "water", "gas", "internet", "trash", "sewer",
})

REVENUE_TAGS = frozenset({"rental_revenue", "cleaning_fee_revenue", "business_income"})
NEUTRAL_TAGS = frozenset({"security_deposit"})
EXPENSE_TAGS = frozenset({
    "channel_fee", "cleaning_expense", "maintenance", "management_fee",
    "mortgage_interest", "mortgage_principal", "insurance", "utilities",
    "taxes", "other_expense", "contract_work", "advertising",
    "legal_professional", "travel", "furnishings",
    "supplies", "home_office", "meals", "vehicle_expenses",
    "health_insurance", "education_training",
})

CATEGORY_TO_SCHEDULE_E: dict[str, str | None] = {
    "rental_revenue":        "line_3_rents_received",
    "cleaning_fee_revenue":  "line_3_rents_received",
    "advertising":           "line_5_advertising",
    "travel":                "line_6_auto_travel",
    "cleaning_expense":      "line_7_cleaning_maintenance",
    "maintenance":           "line_7_cleaning_maintenance",
    "management_fee":        "line_8_commissions",
    "channel_fee":           "line_8_commissions",
    "insurance":             "line_9_insurance",
    "legal_professional":    "line_10_legal_professional",
    "mortgage_interest":     "line_12_mortgage_interest",
    "mortgage_principal":    None,
    "contract_work":         "line_14_repairs",
    "taxes":                 "line_16_taxes",
    "utilities":             "line_17_utilities",
    "furnishings":           "line_19_other",
    "other_expense":         "line_19_other",
    "uncategorized":         None,
    "security_deposit":      None,
    "supplies":              None,
    "home_office":           None,
    "meals":                 None,
    "vehicle_expenses":      None,
    "health_insurance":      None,
    "education_training":    None,
    "business_income":       None,
}

CATEGORY_TO_SCHEDULE_C: dict[str, str | None] = {
    "business_income":       "line_1_gross_receipts",
    "advertising":           "line_8_advertising",
    "vehicle_expenses":      "line_9_car_truck",
    "insurance":             "line_15_insurance",
    "legal_professional":    "line_17_legal_professional",
    "supplies":              "line_22_supplies",
    "travel":                "line_24a_travel",
    "meals":                 "line_24b_meals",
    "utilities":             "line_25_utilities",
    "maintenance":           "line_21_repairs_maintenance",
    "contract_work":         "line_11_contract_labor",
    "home_office":           "line_30_business_use_home",
    "education_training":    "line_27a_other",
    "other_expense":         "line_27a_other",
    "taxes":                 "line_23_taxes_licenses",
    "management_fee":        "line_10_commissions",
    "channel_fee":           "line_10_commissions",
    "mortgage_interest":     None,
    "mortgage_principal":    None,
    "uncategorized":         None,
    "security_deposit":      None,
}


CATEGORY_TO_SCHEDULE_A: dict[str, str | None] = {
    "mortgage_interest":     "line_8a_home_mortgage_interest",
    "taxes":                 "line_5a_state_local_taxes",
    "mortgage_principal":    None,
    "insurance":             None,
    "maintenance":           None,
    "utilities":             None,
    "cleaning_expense":      None,
    "contract_work":         None,
    "advertising":           None,
    "management_fee":        None,
    "channel_fee":           None,
    "legal_professional":    None,
    "travel":                None,
    "furnishings":           None,
    "other_expense":         None,
    "uncategorized":         None,
    "security_deposit":      None,
    "supplies":              None,
    "home_office":           None,
    "meals":                 None,
    "vehicle_expenses":      None,
    "health_insurance":      None,
    "education_training":    None,
    "business_income":       None,
    "rental_revenue":        None,
    "cleaning_fee_revenue":  None,
}


def transaction_type_for_category(category: str) -> str:
    """Return the correct transaction_type for a given category."""
    if category in REVENUE_TAGS or category in NEUTRAL_TAGS:
        return "income"
    return "expense"


def sanitize_tags(tags: list[str]) -> list[str]:
    """Enforce at most one revenue tag and one expense tag, keeping the last in each group."""
    revenue: str | None = None
    expense: str | None = None
    other: list[str] = []

    for tag in tags:
        if tag in REVENUE_TAGS:
            revenue = tag
        elif tag in EXPENSE_TAGS:
            expense = tag
        else:
            other.append(tag)

    result = other
    if revenue:
        result.append(revenue)
    if expense:
        result.append(expense)
    return result
