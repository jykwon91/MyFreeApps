"""Canonical string values for the Rental ROI analytics.

Mirrored as TypeScript unions in
``api-client/src/types/analytics/rental-roi-mortgage-source.ts`` and
``rental-roi-gap-basis.ts`` — a value added here MUST be added there too.
"""

# Where a property's monthly loan payment came from.
MORTGAGE_SOURCE_RECORDS = "records"
MORTGAGE_SOURCE_TRANSACTIONS = "transactions"
MORTGAGE_SOURCE_NONE = "none"

# Cost-line categories for the parts of a loan payment.
LOAN_LINE_PRINCIPAL = "mortgage_principal"
LOAN_LINE_INTEREST = "mortgage_interest"
LOAN_LINE_ESCROW = "mortgage_escrow"

# What a gap is measured against: the target (needs a purchase price) or break-even.
GAP_BASIS_TARGET = "target"
GAP_BASIS_BREAK_EVEN = "break_even"

# Trailing window the averages are taken over, in full calendar months.
WINDOW_MONTHS = 12
