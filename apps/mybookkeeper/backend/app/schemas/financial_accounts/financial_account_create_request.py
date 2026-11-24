"""Payload to add a financial account."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, Field, field_validator

from app.core.financial_account_enums import (
    DEFAULT_CURRENCY,
    INSTITUTION_MAX_LENGTH,
    NAME_MAX_LENGTH,
)
from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL
from app.schemas.financial_accounts.financial_account_field_rules import (
    check_account_type,
    check_transaction_scope,
    clean_currency,
    clean_mask,
    clean_name,
    clean_optional_text,
)


class FinancialAccountCreateRequest(BaseModel):
    name: str = Field(max_length=NAME_MAX_LENGTH)
    account_type: str
    institution_name: str | None = Field(default=None, max_length=INSTITUTION_MAX_LENGTH)
    mask: str | None = None
    currency: str = DEFAULT_CURRENCY
    current_balance_cents: int | None = None
    balance_as_of: _dt.date | None = None
    mortgage_id: uuid.UUID | None = None
    default_transaction_scope: str = TRANSACTION_SCOPE_PERSONAL

    _name = field_validator("name")(clean_name)
    _institution = field_validator("institution_name")(clean_optional_text)
    _type = field_validator("account_type")(check_account_type)
    _mask = field_validator("mask")(clean_mask)
    _currency = field_validator("currency")(clean_currency)
    _scope = field_validator("default_transaction_scope")(check_transaction_scope)
