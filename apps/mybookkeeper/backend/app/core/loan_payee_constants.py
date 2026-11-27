"""Payees the person said are paid for a mortgage or a loan."""
from typing import Final

from app.core.monthly_expense_constants import LABEL_LOANS, LABEL_MORTGAGE

LOAN_PAYEE_KIND_MORTGAGE: Final = "mortgage"
LOAN_PAYEE_KIND_LOAN: Final = "loan"
LOAN_PAYEE_KINDS: Final[tuple[str, ...]] = (LOAN_PAYEE_KIND_MORTGAGE, LOAN_PAYEE_KIND_LOAN)

# The spending heading each kind counts under.
LOAN_PAYEE_KIND_TO_LABEL: Final[dict[str, str]] = {
    LOAN_PAYEE_KIND_MORTGAGE: LABEL_MORTGAGE,
    LOAN_PAYEE_KIND_LOAN: LABEL_LOANS,
}

LOAN_PAYEE_NAME_MAX_LENGTH: Final = 255
LOAN_PAYEE_KIND_MAX_LENGTH: Final = 20
