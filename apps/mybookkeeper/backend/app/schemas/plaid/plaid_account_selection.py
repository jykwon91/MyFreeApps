"""What to do with one account Plaid Link returned: link it to an existing
account (``financial_account_id``) or add it as a new one (None)."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, Field, field_validator

from app.core.plaid_constants import PLAID_ID_MAX_LENGTH
from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL
from app.schemas.financial_accounts.financial_account_field_rules import check_transaction_scope


class PlaidAccountSelection(BaseModel):
    plaid_account_id: str = Field(min_length=1, max_length=PLAID_ID_MAX_LENGTH)
    financial_account_id: uuid.UUID | None = None
    default_transaction_scope: str = TRANSACTION_SCOPE_PERSONAL

    _scope = field_validator("default_transaction_scope")(check_transaction_scope)
