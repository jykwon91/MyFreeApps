"""Customer business-logic service.

Phone normalization rule:
- Strip everything except digits. ``(512) 555-1234`` -> ``5125551234``.
- A US-style 10-digit number is the expected shape; we don't enforce length
  because the operator may serve international or short codes in test mode.
  Length validation is a future concern (Twilio will reject malformed numbers
  at SMS time).

Upsert-by-phone:
- Lookup by normalized phone. If found, update name if it changed (keeps the
  "most recent name" view; e.g., customer originally typed "Jose" then later
  used "Jose P." -- the latter sticks).
- If not found, create.

The service raises :class:`CustomerServiceError` for validation issues so the
public order route can translate them to HTTP 400 with a friendly message.
"""
from __future__ import annotations

import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer.customer import Customer
from app.repositories.customer import customer_repo
from app.schemas.customer.customer_schemas import CustomerCreate


class CustomerServiceError(Exception):
    """Base for customer rule violations."""

    http_status: int = 400


_PHONE_DIGITS_RE = re.compile(r"\D+")


def normalize_phone(raw: str) -> str:
    """Strip non-digit characters from a phone string.

    Returns the digits-only form. Raises :class:`CustomerServiceError` if the
    result is empty (i.e., the input had no digits at all).
    """
    digits = _PHONE_DIGITS_RE.sub("", raw or "")
    if not digits:
        raise CustomerServiceError("Phone number must contain at least one digit.")
    return digits


async def upsert_by_phone(
    db: AsyncSession, body: CustomerCreate,
) -> Customer:
    """Insert or update a customer keyed by phone.

    Trims the name; if the trimmed name is empty, raises a validation error.
    """
    name = (body.name or "").strip()
    if not name:
        raise CustomerServiceError("Customer name is required.")

    phone = normalize_phone(body.phone)

    existing = await customer_repo.get_customer_by_phone(db, phone)
    if existing is None:
        return await customer_repo.create_customer(
            db, {"name": name, "phone": phone},
        )

    if existing.name != name:
        return await customer_repo.update_customer(db, existing, {"name": name})

    return existing
