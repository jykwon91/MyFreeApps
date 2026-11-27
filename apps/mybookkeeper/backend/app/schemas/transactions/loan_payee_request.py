from pydantic import BaseModel

from app.schemas.transactions.loan_payee_kind import LoanPayeeKind


class LoanPayeeRequest(BaseModel):
    """Count every payment to this transaction's payee as a mortgage or a loan."""

    kind: LoanPayeeKind
