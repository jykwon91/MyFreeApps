"""Tax constants — Schedule E line labels and mappings used across export, recompute, and advisor."""

from decimal import Decimal

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

# --- Self-Employment Tax Constants ---

SE_STATUTORY_FACTOR = Decimal("0.9235")
SE_TAX_RATE_FULL = Decimal("0.153")       # 12.4% Social Security + 2.9% Medicare
SE_TAX_RATE_MEDICARE = Decimal("0.029")

# Social Security wage base by tax year (published annually by SSA).
# When adding a new year, use the official figure from SSA press releases.
SE_TAX_WAGE_BASE: dict[int, Decimal] = {
    2023: Decimal("160200"),
    2024: Decimal("168600"),
    2025: Decimal("176100"),
}

# --- Validation Thresholds ---

SALT_CAP = Decimal("10000")
CAPITAL_LOSS_LIMIT = Decimal("3000")
PAL_SPECIAL_ALLOWANCE = Decimal("25000")
PAL_PHASEOUT_START = Decimal("100000")
PAL_PHASEOUT_END = Decimal("150000")

SS_TAX_RATE_EMPLOYEE = Decimal("0.062")

# --- NIIT / Additional Medicare Tax Thresholds ---

NIIT_RATE = Decimal("0.038")
NIIT_THRESHOLD: dict[str, Decimal] = {
    "single": Decimal("200000"),
    "married_filing_jointly": Decimal("250000"),
    "married_filing_separately": Decimal("125000"),
    "head_of_household": Decimal("200000"),
}

ADDITIONAL_MEDICARE_RATE = Decimal("0.009")
ADDITIONAL_MEDICARE_THRESHOLD: dict[str, Decimal] = {
    "single": Decimal("200000"),
    "married_filing_jointly": Decimal("250000"),
    "married_filing_separately": Decimal("125000"),
    "head_of_household": Decimal("200000"),
}

# --- QBI / Section 199A ---

QBI_DEDUCTION_RATE = Decimal("0.20")
QBI_PHASEOUT_START: dict[int, dict[str, Decimal]] = {
    2023: {
        "single": Decimal("182100"),
        "married_filing_jointly": Decimal("364200"),
        "married_filing_separately": Decimal("182100"),
        "head_of_household": Decimal("182100"),
    },
    2024: {
        "single": Decimal("191950"),
        "married_filing_jointly": Decimal("383900"),
        "married_filing_separately": Decimal("191950"),
        "head_of_household": Decimal("191950"),
    },
    2025: {
        "single": Decimal("197300"),
        "married_filing_jointly": Decimal("394600"),
        "married_filing_separately": Decimal("197300"),
        "head_of_household": Decimal("197300"),
    },
}

# --- Rental Rules ---

TAX_FREE_RENTAL_DAYS = 14

# --- De Minimis Safe Harbor ---

DE_MINIMIS_SAFE_HARBOR = Decimal("2500")

# --- Simplified Federal Tax Brackets (for withholding estimation) ---

TAX_BRACKETS: dict[int, dict[str, list[tuple[Decimal, Decimal]]]] = {
    2024: {
        "single": [
            (Decimal("11600"), Decimal("0.10")),
            (Decimal("47150"), Decimal("0.12")),
            (Decimal("100525"), Decimal("0.22")),
            (Decimal("191950"), Decimal("0.24")),
            (Decimal("243725"), Decimal("0.32")),
            (Decimal("609350"), Decimal("0.35")),
            (Decimal("999999999"), Decimal("0.37")),
        ],
        "married_filing_jointly": [
            (Decimal("23200"), Decimal("0.10")),
            (Decimal("94300"), Decimal("0.12")),
            (Decimal("201050"), Decimal("0.22")),
            (Decimal("383900"), Decimal("0.24")),
            (Decimal("487450"), Decimal("0.32")),
            (Decimal("731200"), Decimal("0.35")),
            (Decimal("999999999"), Decimal("0.37")),
        ],
        "married_filing_separately": [
            (Decimal("11600"), Decimal("0.10")),
            (Decimal("47150"), Decimal("0.12")),
            (Decimal("100525"), Decimal("0.22")),
            (Decimal("191950"), Decimal("0.24")),
            (Decimal("243725"), Decimal("0.32")),
            (Decimal("365600"), Decimal("0.35")),
            (Decimal("999999999"), Decimal("0.37")),
        ],
        "head_of_household": [
            (Decimal("16550"), Decimal("0.10")),
            (Decimal("63100"), Decimal("0.12")),
            (Decimal("100500"), Decimal("0.22")),
            (Decimal("191950"), Decimal("0.24")),
            (Decimal("243700"), Decimal("0.32")),
            (Decimal("609350"), Decimal("0.35")),
            (Decimal("999999999"), Decimal("0.37")),
        ],
    },
    2025: {
        "single": [
            (Decimal("11925"), Decimal("0.10")),
            (Decimal("48475"), Decimal("0.12")),
            (Decimal("103350"), Decimal("0.22")),
            (Decimal("197300"), Decimal("0.24")),
            (Decimal("250525"), Decimal("0.32")),
            (Decimal("626350"), Decimal("0.35")),
            (Decimal("999999999"), Decimal("0.37")),
        ],
        "married_filing_jointly": [
            (Decimal("23850"), Decimal("0.10")),
            (Decimal("96950"), Decimal("0.12")),
            (Decimal("206700"), Decimal("0.22")),
            (Decimal("394600"), Decimal("0.24")),
            (Decimal("501050"), Decimal("0.32")),
            (Decimal("751600"), Decimal("0.35")),
            (Decimal("999999999"), Decimal("0.37")),
        ],
        "married_filing_separately": [
            (Decimal("11925"), Decimal("0.10")),
            (Decimal("48475"), Decimal("0.12")),
            (Decimal("103350"), Decimal("0.22")),
            (Decimal("197300"), Decimal("0.24")),
            (Decimal("250525"), Decimal("0.32")),
            (Decimal("375800"), Decimal("0.35")),
            (Decimal("999999999"), Decimal("0.37")),
        ],
        "head_of_household": [
            (Decimal("17000"), Decimal("0.10")),
            (Decimal("64850"), Decimal("0.12")),
            (Decimal("103350"), Decimal("0.22")),
            (Decimal("197300"), Decimal("0.24")),
            (Decimal("250500"), Decimal("0.32")),
            (Decimal("626350"), Decimal("0.35")),
            (Decimal("999999999"), Decimal("0.37")),
        ],
    },
}

# Estimated tax safe harbor: 90% of current year or 100%/110% of prior year
ESTIMATED_TAX_SAFE_HARBOR_PCT = Decimal("0.90")
ESTIMATED_TAX_PRIOR_YEAR_PCT = Decimal("1.00")
ESTIMATED_TAX_HIGH_INCOME_PRIOR_PCT = Decimal("1.10")
ESTIMATED_TAX_HIGH_INCOME_AGI = Decimal("150000")

# Standard deduction by (tax_year, filing_status).
# Filing statuses: single, married_filing_jointly, married_filing_separately, head_of_household
STANDARD_DEDUCTION: dict[int, dict[str, Decimal]] = {
    2023: {
        "single": Decimal("13850"),
        "married_filing_jointly": Decimal("27700"),
        "married_filing_separately": Decimal("13850"),
        "head_of_household": Decimal("20800"),
    },
    2024: {
        "single": Decimal("14600"),
        "married_filing_jointly": Decimal("29200"),
        "married_filing_separately": Decimal("14600"),
        "head_of_household": Decimal("21900"),
    },
    2025: {
        "single": Decimal("15000"),
        "married_filing_jointly": Decimal("30000"),
        "married_filing_separately": Decimal("15000"),
        "head_of_household": Decimal("22500"),
    },
}
