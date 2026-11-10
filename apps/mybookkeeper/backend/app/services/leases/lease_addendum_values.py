"""The placeholder values an added document is rendered with, and what is saved.

On a lease whose documents are locked the lease's own values are the record:
a saved value or date is never overwritten (an override that differs from one
is refused), but keys the lease has no value for yet are saved and an empty
start or end date is filled, so an imported lease can still take an addendum's
values.
"""
from __future__ import annotations

import datetime as _dt
import logging
from collections.abc import Sequence
from typing import Any

from app.models.applicants.applicant import Applicant
from app.models.inquiries.inquiry import Inquiry
from app.models.leases.lease_template_placeholder import LeaseTemplatePlaceholder
from app.models.leases.signed_lease import SignedLease
from app.models.properties.property import Property
from app.models.user.user import User
from app.services.leases._lease_helpers import _denormalise_dates
from app.services.leases.exceptions.lease_value_locked_error import LeaseValueLockedError
from app.services.leases.default_source_resolver import resolve_default_source

logger = logging.getLogger(__name__)


def merge_addendum_values(
    *,
    lease: SignedLease,
    placeholders: Sequence[LeaseTemplatePlaceholder],
    override: dict[str, str] | None,
    applicant: Applicant,
    inquiry: Inquiry | None,
    property_record: Property | None,
    user_record: User | None,
    today: _dt.date,
    is_locked: bool,
) -> tuple[dict[str, str], dict[str, Any]]:
    """Returns ``(values to render with, lease fields to save)``."""
    merged: dict[str, str] = {
        k: ("" if v is None else str(v)) for k, v in (lease.values or {}).items()
    }
    for p in placeholders:
        if merged.get(p.key) not in (None, "") or not p.default_source:
            continue
        try:
            resolved, _ = resolve_default_source(
                p.default_source, applicant, inquiry,
                today=today, lease=lease, property_record=property_record, user_record=user_record,
            )
        except (ValueError, AttributeError):
            logger.warning(
                "default_source resolution failed for placeholder %s on lease %s",
                p.key, lease.id, exc_info=True,
            )
            continue
        if resolved is not None and resolved != "":
            merged[p.key] = str(resolved)

    saved = {k: v for k, v in (lease.values or {}).items() if v not in (None, "")}
    if is_locked:
        changed = sorted(k for k, v in (override or {}).items() if v is not None and k in saved and str(v) != str(saved[k]))
        if changed:
            raise LeaseValueLockedError(changed)
    for k, v in (override or {}).items():
        if v is None or (is_locked and k in saved):
            continue
        merged[k] = str(v)

    persisted = {**(lease.values or {}), **{k: v for k, v in merged.items() if k not in saved}} if is_locked else merged
    fields: dict[str, Any] = {}
    if persisted != (lease.values or {}):
        new_start, new_end = _denormalise_dates(persisted)
        fields["values"] = persisted
        if new_start is not None and lease.starts_on is None:
            fields["starts_on"] = new_start
        if new_end is not None and lease.ends_on is None:
            fields["ends_on"] = new_end
    return merged, fields
