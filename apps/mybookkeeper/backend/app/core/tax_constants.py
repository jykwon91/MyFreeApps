"""Tax constants — Schedule E line labels and mappings used across export, recompute, and advisor."""

SCHEDULE_E_LINE_LABELS: dict[str, str] = {
    "line_3": "Rents received",
    "line_5": "Advertising",
    "line_6": "Auto and travel",
    "line_7": "Cleaning and maintenance",
    "line_8": "Commissions",
    "line_9": "Insurance",
    "line_10": "Legal and other professional fees",
    "line_12": "Mortgage interest paid to financial institutions",
    "line_13": "Other interest",
    "line_14": "Repairs",
    "line_16": "Taxes",
    "line_17": "Utilities",
    "line_18": "Depreciation expense or depletion",
    "line_19": "Other",
    "line_20": "Total expenses",
    "line_21": "Net income or (loss)",
    "line_26": "Total rental real estate income or (loss)",
}

SCHEDULE_C_LINE_LABELS: dict[str, str] = {
    "line_1": "Gross receipts or sales",
    "line_8": "Advertising",
    "line_9": "Car and truck expenses",
    "line_10": "Commissions and fees",
    "line_11": "Contract labor",
    "line_15": "Insurance (other than health)",
    "line_17": "Legal and professional services",
    "line_21": "Repairs and maintenance",
    "line_22": "Supplies",
    "line_23": "Taxes and licenses",
    "line_24a": "Travel",
    "line_24b": "Meals (50%)",
    "line_25": "Utilities",
    "line_27a": "Other expenses",
    "line_28_total_expenses": "Total expenses",
    "line_29_net_profit": "Net profit or (loss)",
    "line_30": "Business use of home",
}

SCHEDULE_A_LINE_LABELS: dict[str, str] = {
    "line_5a": "State and local income taxes",
    "line_8a": "Home mortgage interest",
}

SCHEDULE_SE_LABELS: dict[str, str] = {
    "net_earnings": "Net earnings from self-employment",
    "se_tax": "Self-employment tax",
    "deductible_half": "Deductible part of SE tax",
}

SCHEDULE_E_EXPORT_LABELS: dict[str, str] = {
    "line_3_rents_received": "3 - Rents received",
    "line_4_royalties": "4 - Royalties received",
    "line_5_advertising": "5 - Advertising",
    "line_6_auto_travel": "6 - Auto and travel",
    "line_7_cleaning_maintenance": "7 - Cleaning and maintenance",
    "line_8_commissions": "8 - Commissions",
    "line_9_insurance": "9 - Insurance",
    "line_10_legal_professional": "10 - Legal and other professional fees",
    "line_12_mortgage_interest": "12 - Mortgage interest",
    "line_13_other_interest": "13 - Other interest",
    "line_14_repairs": "14 - Repairs",
    "line_16_taxes": "16 - Taxes",
    "line_17_utilities": "17 - Utilities",
    "line_18_depreciation": "18 - Depreciation expense",
    "line_19_other": "19 - Other expenses",
}
