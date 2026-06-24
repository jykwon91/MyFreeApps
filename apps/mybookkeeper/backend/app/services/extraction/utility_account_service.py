"""Service for learning + resolving utility account -> property links.

Utility "bill is ready / due" notification emails carry a provider account
number + amount but NO service address, so ``property_matcher_service`` can't
resolve them by address. This service remembers the mapping the first time a
bill IS resolvable — keyed on ``(sender_domain, account_number)`` — so future
thin notifications from the same provider account resolve to the right property.

Two pure helpers normalize the lookup key. They MUST be applied identically on
the learn-write and the lookup, or the equality match silently misses:
  - :func:`normalize_account_number` — upper-cases and strips spaces/dashes/dots
    so "12-3456-7890" and "1234567890" map to one key.
  - :func:`sender_domain_from_email` — extracts the domain and collapses provider
    sub-mailers to the registrable domain (last two labels), so
    ``emailff.att-mail.com`` and ``emaildl.att-mail.com`` both → ``att-mail.com``.

This module does NOT import ``property_matcher_service`` — that module imports
this one (the resolver calls ``learn_account_link``). Keeping the dependency
one-directional avoids an import cycle.
"""
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.trusted_email_senders import _extract_domain
from app.core.utility_account_constants import PROVIDER_LABELS
from app.repositories.properties import utility_account_link_repo

logger = logging.getLogger(__name__)


def normalize_account_number(raw: str) -> str:
    """Normalize a provider account number to its lookup-key form.

    Upper-cases and removes spaces, dashes, and dots so the same account written
    different ways ("12-3456-7890" vs "1234567890") maps to a single key.
    """
    cleaned = raw.upper()
    for ch in (" ", "-", "."):
        cleaned = cleaned.replace(ch, "")
    return cleaned


def sender_domain_from_email(sender_email: str | None) -> str | None:
    """Return the registrable provider domain for ``sender_email``, or None.

    Reuses ``_extract_domain`` (lowercase + angle-bracket strip), then collapses
    provider sub-mailers to the registrable domain by keeping the last two
    labels: ``emailff.att-mail.com`` -> ``att-mail.com``, ``tmr3.com`` ->
    ``tmr3.com``, ``houstontx.gov`` -> ``houstontx.gov``. A single provider thus
    maps to a single key regardless of which mailer host sent the notification.
    """
    if not sender_email:
        return None
    domain = _extract_domain(sender_email)
    if not domain:
        return None
    labels = domain.split(".")
    if len(labels) <= 2:
        return domain
    return ".".join(labels[-2:])


async def learn_account_link(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    sender_domain: str | None,
    account_number: str | None,
    property_id: uuid.UUID,
) -> None:
    """Remember that (sender_domain, account_number) bills for ``property_id``.

    No-op when ``sender_domain`` or ``account_number`` is falsy (a thin
    notification that didn't expose an account number, or a non-email path).
    Normalizes the key, fills ``provider_label`` from the known-domain map, and
    upserts with ``source='auto_learn'``.

    A ``manual_link`` row is authoritative: if one already exists for this key it
    is NOT overwritten by this auto-learn write (the host's explicit choice
    wins). Re-learning the same account for the same property, or moving the
    account to a new property, updates the existing auto-learned row.
    """
    if not sender_domain or not account_number:
        return

    normalized_account = normalize_account_number(account_number)
    if not normalized_account:
        return

    existing = await utility_account_link_repo.get_by_account(
        db,
        organization_id=organization_id,
        sender_domain=sender_domain,
        account_number=normalized_account,
    )
    if existing is not None and existing.source == "manual_link":
        # Manual link is authoritative — the host explicitly tied this account
        # to a property; an auto-learn must never override that choice.
        logger.debug(
            "Skipping auto_learn for (%s, %s) — manual_link is authoritative",
            sender_domain, normalized_account,
        )
        return

    await utility_account_link_repo.upsert_link(
        db,
        organization_id=organization_id,
        user_id=user_id,
        sender_domain=sender_domain,
        account_number=normalized_account,
        property_id=property_id,
        source="auto_learn",
        provider_label=PROVIDER_LABELS.get(sender_domain),
    )
