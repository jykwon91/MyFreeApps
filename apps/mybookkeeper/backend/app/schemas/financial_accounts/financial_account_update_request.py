"""Partial update for a financial account.

Field-level rules only. The pairings (a balance needs its as-of date; only a
mortgage account links a mortgage) depend on columns a patch may not carry,
so the service checks them against the merged row.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel, Field, field_validator

from app.core.financial_account_enums import INSTITUTION_MAX_LENGTH, NAME_MAX_LENGTH
from app.schemas.financial_accounts.financial_account_field_rules import (
    check_account_type,
    check_transaction_scope,
    clean_currency,
    clean_mask,
    clean_name,
    clean_optional_text,
)


class FinancialAccountUpdateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=NAME_MAX_LENGTH)
    account_type: str | None = None
    institution_name: str | None = Field(default=None, max_length=INSTITUTION_MAX_LENGTH)
    mask: str | None = None
    currency: str | None = None
    current_balance_cents: int | None = None
    balance_as_of: _dt.date | None = None
    closed_on: _dt.date | None = None
    mortgage_id: uuid.UUID | None = None
    default_transaction_scope: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        return None if value is None else clean_name(value)

    @field_validator("account_type")
    @classmethod
    def _type(cls, value: str | None) -> str | None:
        return None if value is None else check_account_type(value)

    @field_validator("default_transaction_scope")
    @classmethod
    def _scope(cls, value: str | None) -> str | None:
        return None if value is None else check_transaction_scope(value)

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str | None) -> str | None:
        return None if value is None else clean_currency(value)

    _institution = field_validator("institution_name")(clean_optional_text)
    _mask = field_validator("mask")(clean_mask)
