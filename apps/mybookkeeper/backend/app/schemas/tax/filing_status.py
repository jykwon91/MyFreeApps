from typing import Literal

# Matches app.core.tax_return_enums.FILING_STATUSES (test_tax_return_schema.py checks it).
FilingStatus = Literal[
    "single",
    "married_filing_jointly",
    "married_filing_separately",
    "head_of_household",
    "qualifying_surviving_spouse",
]
