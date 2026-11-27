"""ORM model for ``loan_payees``: payees whose payments are a mortgage or a loan.

A bank often can't tell a mortgage payment from money moved between accounts:
"<Your Name> External F <Your Name> WEB ID: ..." names the account holder, so it
reads as money sent to themselves, and a lender's ACH can read as any bill.
When the person says a payee is a mortgage or a loan, every payment to it,
past and future, counts under that heading (``expense_rules``). Nothing on the
transaction changes, so taking the rule back restores how it counted.

``normalized_payee`` is the payee's key (``core/payee_keys.payee_key``): the
payee as Monthly expenses names it, without the payment reference, normalised.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.loan_payee_constants import LOAN_PAYEE_KIND_MAX_LENGTH, LOAN_PAYEE_NAME_MAX_LENGTH
from app.db.base import Base


class LoanPayee(Base):
    __tablename__ = "loan_payees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False,
    )
    # The rule belongs to the workspace, so it outlives the member who made it.
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    display_name: Mapped[str] = mapped_column(String(LOAN_PAYEE_NAME_MAX_LENGTH), nullable=False)
    normalized_payee: Mapped[str] = mapped_column(String(LOAN_PAYEE_NAME_MAX_LENGTH), nullable=False)
    # "mortgage" or "loan" (``LOAN_PAYEE_KINDS``).
    kind: Mapped[str] = mapped_column(String(LOAN_PAYEE_KIND_MAX_LENGTH), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        # Its leftmost organization_id prefix serves the per-workspace load.
        UniqueConstraint("organization_id", "normalized_payee", name="uq_loan_payees_org_payee"),
        CheckConstraint("normalized_payee <> ''", name="chk_loan_payees_payee"),
        CheckConstraint("kind IN ('mortgage', 'loan')", name="chk_loan_payees_kind"),
        Index("ix_loan_payees_created_by", "created_by_user_id"),
    )
