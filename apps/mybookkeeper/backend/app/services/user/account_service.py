"""MBK-specific account-management services.

This module owns:

  * :func:`build_export` — assembles a full per-user data export
    (properties, documents, transactions, integrations). MBK-specific
    because the domain rows differ across apps.
  * :func:`delete_account` — hard-delete the user row; the FK cascade
    wipes every related domain row. Also app-specific.

The lockout-policy half (``record_failed_login``,
``record_successful_login``, ``is_locked``, ``_lock_duration_for``)
was promoted to ``platform_shared.services.account_lockout`` in PR M7
and is re-exported below for back-compat with existing call sites that
do ``from app.services.user.account_service import record_failed_login``.
The MBK-specific exponential schedule + threshold remain configurable
through ``app.core.config.settings.lockout_threshold`` and
``settings.lockout_autoreset_hours`` — the wrapper functions inject
those values into the shared helpers so production behaviour is
byte-identical with pre-M7.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.account_lockout import (
    autoreset_update_if_stale as _autoreset_update_if_stale,
    is_locked as _shared_is_locked,
    record_failed_login as _shared_record_failed_login,
    record_successful_login_update as _shared_record_successful_login_update,
)

from app.core.config import settings
from app.models.user.user import User
from app.repositories.documents import document_repo
from app.repositories.integrations import integration_repo
from app.repositories.properties import property_repo
from app.repositories.transactions import transaction_repo
from app.repositories.user import user_repo
from app.services.system.auth_event_service import log_auth_event

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Back-compat lockout shims
#
# Existing callers (and any future callers) that do
# ``from app.services.user.account_service import record_failed_login``
# keep working. New code should import directly from
# ``platform_shared.services.account_lockout``.
# ---------------------------------------------------------------------------


async def record_failed_login(
    user: User,
    db: AsyncSession,
    *,
    metadata: Optional[dict[str, Any]] = None,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """Compute the post-failure update dict and emit a LOGIN_FAILURE row.

    Back-compat wrapper that injects MBK's configured lockout threshold
    and the standard ``log_auth_event`` writer. Returns the update dict
    the caller must persist (mirrors the contract of the shared helper).
    Audit semantics are preserved byte-identical with pre-M7 — see the
    note on :func:`platform_shared.services.account_lockout.record_failed_login`.
    """
    return await _shared_record_failed_login(
        user,
        db=db,
        user_id=user.id,
        lockout_threshold=settings.lockout_threshold,
        metadata=metadata,
        now=now,
    )


def record_successful_login(user: User) -> Optional[dict[str, Any]]:
    """Return the clear-counters update dict, or ``None`` if nothing to clear."""
    return _shared_record_successful_login_update(user)


def is_locked(user: User, *, now: Optional[datetime] = None) -> bool:
    """Return ``True`` iff the account is currently locked."""
    return _shared_is_locked(user, now=now)


def autoreset_update_if_stale(
    user: User,
    *,
    now: Optional[datetime] = None,
) -> Optional[dict[str, Any]]:
    """Return the auto-reset update dict if the counter is stale, else ``None``."""
    return _autoreset_update_if_stale(
        user,
        now=now,
        autoreset_hours=settings.lockout_autoreset_hours,
    )


def _user_to_export_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "totp_enabled": user.totp_enabled,
    }


def _property_to_export_dict(prop) -> dict:
    return {
        "id": str(prop.id),
        "name": prop.name,
        "address": prop.address,
        "classification": prop.classification.value if prop.classification else None,
        "type": prop.type.value if prop.type else None,
        "is_active": prop.is_active,
        "purchase_price": str(prop.purchase_price) if prop.purchase_price is not None else None,
        "land_value": str(prop.land_value) if prop.land_value is not None else None,
        "date_placed_in_service": prop.date_placed_in_service.isoformat() if prop.date_placed_in_service else None,
        "created_at": prop.created_at.isoformat() if prop.created_at else None,
    }


def _document_to_export_dict(doc) -> dict:
    return {
        "id": str(doc.id),
        "file_name": doc.file_name,
        "file_type": doc.file_type,
        "document_type": doc.document_type,
        "source": doc.source,
        "status": doc.status,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


def _transaction_to_export_dict(txn) -> dict:
    return {
        "id": str(txn.id),
        "transaction_date": txn.transaction_date.isoformat() if txn.transaction_date else None,
        "tax_year": txn.tax_year,
        "vendor": txn.vendor,
        "description": txn.description,
        "amount": str(txn.amount),
        "transaction_type": txn.transaction_type,
        "category": txn.category,
        "sub_category": txn.sub_category,
        "tags": txn.tags,
        "status": txn.status,
        "payment_method": txn.payment_method,
        "channel": txn.channel,
        "tax_relevant": txn.tax_relevant,
        "schedule_e_line": txn.schedule_e_line,
        "is_capital_improvement": txn.is_capital_improvement,
        "reconciled": txn.reconciled,
        "created_at": txn.created_at.isoformat() if txn.created_at else None,
    }


def _integration_to_export_dict(integration) -> dict:
    return {
        "provider": integration.provider,
        "connected": True,
        "last_synced_at": integration.last_synced_at.isoformat() if integration.last_synced_at else None,
        "created_at": integration.created_at.isoformat() if integration.created_at else None,
    }


async def build_export(
    db: AsyncSession,
    user: User,
    organization_id: uuid.UUID,
) -> dict:
    """Assemble the full data export for a user."""
    properties = await property_repo.list_by_org(db, organization_id)
    documents = await document_repo.list_by_user(db, user.id)
    transactions = await transaction_repo.list_by_user(db, user.id)
    integrations = await integration_repo.list_by_org(db, organization_id)

    await log_auth_event(
        db,
        event_type=AuthEventType.DATA_EXPORTED,
        user_id=user.id,
        succeeded=True,
    )

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": _user_to_export_dict(user),
        "properties": [_property_to_export_dict(p) for p in properties],
        "documents": [_document_to_export_dict(d) for d in documents],
        "transactions": [_transaction_to_export_dict(t) for t in transactions],
        "integrations": [_integration_to_export_dict(i) for i in integrations],
    }


async def delete_account(db: AsyncSession, user: User) -> None:
    """Hard-delete the user row; all related rows cascade-delete via FK.

    Logs the ACCOUNT_DELETED event BEFORE the cascade so the event row
    is written in the same transaction and survives if the delete fails.
    """
    logger.warning(
        "Account deletion: user_id=%s email=%s",
        user.id,
        user.email,
    )
    loaded_user = await user_repo.get_by_id(db, user.id)
    if loaded_user is None:
        return
    # Log BEFORE delete — the auth_events table has no FK to users, so the
    # event row is safe even after the user cascade completes.
    await log_auth_event(
        db,
        event_type=AuthEventType.ACCOUNT_DELETED,
        user_id=user.id,
        succeeded=True,
    )
    await db.delete(loaded_user)
