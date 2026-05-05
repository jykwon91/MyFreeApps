"""Request schema for triggering company research.

POST /companies/{company_id}/research accepts an optional empty body.
The request carries no user-supplied fields today — all inputs come from
the company record itself (name + primary_domain).

Extra fields are forbidden to prevent mass-assignment issues.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class CompanyResearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
