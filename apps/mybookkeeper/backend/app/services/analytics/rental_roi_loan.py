"""The parts of a mortgage the Rental ROI arithmetic reads."""
from dataclasses import dataclass


@dataclass(frozen=True)
class RentalRoiLoan:
    monthly_principal_cents: int | None
    monthly_interest_cents: int | None
    monthly_escrow_cents: int | None
    original_principal_cents: int | None

    @property
    def has_payment(self) -> bool:
        """Whether the record states any part of the monthly payment."""
        return any(
            value is not None
            for value in (
                self.monthly_principal_cents,
                self.monthly_interest_cents,
                self.monthly_escrow_cents,
            )
        )
