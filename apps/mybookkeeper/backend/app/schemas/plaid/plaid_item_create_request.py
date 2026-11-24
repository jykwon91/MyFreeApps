"""Finish connecting a bank: the public token from Link plus what to do with
each account. ``institution_*`` come from Link's metadata and are display
only."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.core.financial_account_enums import INSTITUTION_MAX_LENGTH
from app.core.plaid_constants import PLAID_INSTITUTION_ID_MAX_LENGTH, PLAID_PUBLIC_TOKEN_MAX_LENGTH
from app.schemas.financial_accounts.financial_account_field_rules import clean_optional_text
from app.schemas.plaid.plaid_account_selection import PlaidAccountSelection


class PlaidItemCreateRequest(BaseModel):
    public_token: str = Field(min_length=1, max_length=PLAID_PUBLIC_TOKEN_MAX_LENGTH)
    institution_id: str | None = Field(default=None, max_length=PLAID_INSTITUTION_ID_MAX_LENGTH)
    institution_name: str | None = Field(default=None, max_length=INSTITUTION_MAX_LENGTH)
    accounts: list[PlaidAccountSelection] = Field(min_length=1)

    _institution = field_validator("institution_name")(clean_optional_text)

    @field_validator("accounts")
    @classmethod
    def _distinct(cls, value: list[PlaidAccountSelection]) -> list[PlaidAccountSelection]:
        plaid_ids = [a.plaid_account_id for a in value]
        if len(set(plaid_ids)) != len(plaid_ids):
            raise ValueError("each bank account can be listed once")
        linked = [a.financial_account_id for a in value if a.financial_account_id is not None]
        if len(set(linked)) != len(linked):
            raise ValueError("two bank accounts cannot be linked to the same account")
        return value
