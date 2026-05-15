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
import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer.customer import Customer
from app.repositories.customer import customer_repo
from app.schemas.customer.customer_schemas import CustomerCreate


class CustomerServiceError(Exception):
    """Base for customer rule violations."""

    http_status: int = 400


class CustomerNotFoundError(CustomerServiceError):
    http_status = 404


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


async def find_by_normalized_phone(
    db: AsyncSession, raw_phone: str,
) -> Optional[Customer]:
    """Lookup a customer by phone with normalization.

    Returns ``None`` if either the phone is unparseable (no digits) or the
    customer doesn't exist -- callers map both to "not found" for the
    public lookup endpoint.
    """
    try:
        phone = normalize_phone(raw_phone)
    except CustomerServiceError:
        return None
    return await customer_repo.get_customer_by_phone(db, phone)


async def update_notes(
    db: AsyncSession, customer_id: uuid.UUID, notes: Optional[str],
) -> Customer:
    """Replace the customer's ``notes`` field.

    Empty string is normalised to ``None`` so the table doesn't accumulate
    blank rows. Notes are operator-only freeform text; no length validation
    beyond the schema's max_length.
    """
    customer = await customer_repo.get_customer_by_id(db, customer_id)
    if customer is None:
        raise CustomerNotFoundError(f"Customer {customer_id} not found.")

    cleaned: Optional[str] = (notes or "").strip() or None
    return await customer_repo.update_customer(db, customer, {"notes": cleaned})


async def list_with_stats(
    db: AsyncSession, *, search: Optional[str] = None, limit: int = 200,
) -> list[dict]:
    """Return list of customers with order_count + last_order_at."""
    return await customer_repo.list_customers_with_stats(
        db, search=search, limit=limit,
    )
