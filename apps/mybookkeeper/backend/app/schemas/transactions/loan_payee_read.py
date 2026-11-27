from pydantic import BaseModel

from app.schemas.transactions.loan_payee_kind import LoanPayeeKind


class LoanPayeeRead(BaseModel):
    """Who a transaction paid, and whether payments to them count as a
    mortgage or a loan."""

    # The payee as Monthly expenses names it.
    payee: str
    # None when the payee isn't tagged.
    kind: LoanPayeeKind | None
    # Only money out can be a mortgage or loan payment, and only a named payee
    # can be remembered.
    can_tag: bool
