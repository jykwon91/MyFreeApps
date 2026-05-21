"""Lease extension service.

Extends a signed/active lease's end date without creating a new lease.
The flow is hybrid A+C from the design memo (project memory:
``project_lease_extension_feature_design.md``):

- ``signed_leases.ends_on`` is updated in place.
- A new ``lease_term_versions`` row records the change (seed row preserved).
- A rendered extension-addendum PDF is uploaded to MinIO as a
  ``signed_addendum`` attachment so the legal record exists.
- Optionally, the host's tenant is emailed the rendered addendum.

The system ships a baked-in default addendum template (plaintext +
``[KEY]`` placeholders) rendered to PDF by ``render_pdf_from_text``. A
user-customisable template upload flow is a follow-up — for now, every
extension uses the default boilerplate.

Status guard: only ``signed`` and ``active`` leases can be extended.
``draft`` / ``generated`` / ``sent`` should use the existing values-edit
path (the lease isn't legally in force yet). ``ended`` / ``terminated``
reject because the lease is closed.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.applicants import applicant_event_repo, applicant_repo
from app.repositories.leases import (
    lease_term_version_repo,
    signed_lease_attachment_repo,
    signed_lease_repo,
)
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.services.leases._lease_helpers import (
    SignedLeaseNotFoundError,
    _load_resolution_context,
)
from app.services.leases.lease_lifecycle_service import get_lease
from app.services.leases.renderer import render_md, render_pdf_from_text

logger = logging.getLogger(__name__)


# Statuses for which an extension is a valid mutation. Outside this set,
# the host should either edit lease values directly (``draft`` /
# ``generated`` / ``sent``) or open a new successor lease (``ended`` /
# ``terminated``, when PR 4 lands).
EXTENSION_ALLOWED_STATUSES: frozenset[str] = frozenset({"signed", "active"})


class InvalidLeaseStatusForExtensionError(ValueError):
    """Lease is not in ``signed`` or ``active`` status."""


class NewEndDateNotAfterCurrentError(ValueError):
    """``new_ends_on`` must be strictly after the lease's current ``ends_on``."""


class MissingCurrentEndDateError(ValueError):
    """The lease has no ``ends_on`` set — cannot extend from an unknown date."""


class ExtensionNotFoundError(LookupError):
    """The requested ``lease_term_versions`` row is not in the lease's live set."""


class CannotUndoSeedRowError(ValueError):
    """Refused to undo the seed term (would lose the original lease term)."""


class NotLatestExtensionError(ValueError):
    """The requested version is not the latest extension — undo is FIFO only."""


class UndoWindowExpiredError(ValueError):
    """The extension was committed more than ``UNDO_WINDOW_DAYS`` ago."""


# How long after an extension was committed the host can still undo it.
# Generous window — tenants sometimes change their mind weeks after
# signing the addendum. Undo is strictly reversible (re-extend if needed).
UNDO_WINDOW_DAYS: int = 30


# 1-page boilerplate. Placeholders match the addendum-aware keys already
# present in ``default_source_map.py``. Unknown keys remain bracketed in
# the rendered output (per ``render_md`` contract), which is the right
# behaviour for missing context — the host sees "[PROPERTY ADDRESS]" and
# knows to fill in the address on the listing.
_DEFAULT_ADDENDUM_TEMPLATE = """\
LEASE EXTENSION ADDENDUM

This Addendum is entered into by and between [LANDLORD FULL NAME]
("Landlord") and [TENANT FULL NAME] ("Tenant") and amends the lease
agreement covering the premises at [PROPERTY ADDRESS].

ORIGINAL LEASE TERM
- Start date: [ORIGINAL LEASE START DATE]
- Original end date: [ORIGINAL LEASE END DATE]

EXTENSION
The lease term is extended through [NEW LEASE END DATE]. All other
terms and conditions of the original lease remain unchanged.

NOTES
[EXTENSION NOTES]

EXECUTED ON [EFFECTIVE DATE]


Landlord: [LANDLORD SIGNATURE]

Tenant: [TENANT SIGNATURE]
"""


async def extend_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    new_ends_on: _dt.date,
    notes: str | None,
) -> tuple[SignedLeaseResponse, _dt.datetime]:
    """Extend a signed/active lease's end date.

    Returns ``(detail, extended_at)``. The route uses ``extended_at`` to
    schedule a post-commit email best-effort to the tenant.

    Raises:
        SignedLeaseNotFoundError: lease not in (user_id, organization_id).
        InvalidLeaseStatusForExtensionError: status is not signed/active.
        MissingCurrentEndDateError: lease has no current ``ends_on``.
        NewEndDateNotAfterCurrentError: ``new_ends_on <= current ends_on``.
    """
    now = _dt.datetime.now(_dt.timezone.utc)

    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

        if lease.status not in EXTENSION_ALLOWED_STATUSES:
            raise InvalidLeaseStatusForExtensionError(
                f"Lease status '{lease.status}' cannot be extended. "
                "Only signed or active leases can be extended.",
            )

        if lease.ends_on is None:
            raise MissingCurrentEndDateError(
                "Lease has no current end date set — fill in the original "
                "term before extending.",
            )

        if new_ends_on <= lease.ends_on:
            raise NewEndDateNotAfterCurrentError(
                f"new_ends_on ({new_ends_on.isoformat()}) must be strictly "
                f"after the current end date ({lease.ends_on.isoformat()}).",
            )

        original_starts_on = lease.starts_on or lease.ends_on
        original_ends_on = lease.ends_on

        applicant, _inquiry, property_record, user_record = (
            await _load_resolution_context(
                db,
                lease=lease,
                organization_id=organization_id,
                user_id=user_id,
            )
        )

        substitutions = _build_substitutions(
            applicant=applicant,
            property_record=property_record,
            user_record=user_record,
            original_starts_on=original_starts_on,
            original_ends_on=original_ends_on,
            new_ends_on=new_ends_on,
            notes=notes,
            effective_date=now.date(),
        )

        rendered_text = render_md(_DEFAULT_ADDENDUM_TEMPLATE, substitutions)
        pdf_bytes = render_pdf_from_text(rendered_text)

        attachment_id = uuid.uuid4()
        storage_key = f"signed-leases/{lease_id}/{attachment_id}"
        storage = get_storage()
        storage.upload_file(storage_key, pdf_bytes, "application/pdf")

        try:
            attachment = await signed_lease_attachment_repo.create(
                db,
                id=attachment_id,
                lease_id=lease.id,
                storage_key=storage_key,
                filename=_addendum_filename(new_ends_on),
                content_type="application/pdf",
                size_bytes=len(pdf_bytes),
                kind="signed_addendum",
                uploaded_by_user_id=user_id,
                uploaded_at=now,
            )

            await lease_term_version_repo.create(
                db,
                lease_id=lease.id,
                starts_on=original_starts_on,
                ends_on=new_ends_on,
                source_attachment_id=attachment.id,
                created_by_user_id=user_id,
                created_at=now,
            )

            await signed_lease_repo.update_lease(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                fields={"ends_on": new_ends_on, "updated_at": now},
            )

            if applicant is not None:
                tenancy_restarted = applicant.tenant_ended_at is not None
                if tenancy_restarted:
                    await applicant_repo.clear_tenancy_ended(
                        db, applicant=applicant, now=now,
                    )
                await applicant_event_repo.append(
                    db,
                    applicant_id=applicant.id,
                    event_type="tenancy_extended",
                    actor="host",
                    occurred_at=now,
                    payload={
                        "lease_id": str(lease_id),
                        "previous_ends_on": original_ends_on.isoformat(),
                        "new_ends_on": new_ends_on.isoformat(),
                        "tenancy_restarted": tenancy_restarted,
                    },
                )
        except Exception:
            # DB write failed after we uploaded the PDF — best-effort cleanup
            # of the orphan object so the bucket doesn't accumulate dead files
            # on retries.
            try:
                storage.delete_file(storage_key)
            except Exception:  # noqa: BLE001
                logger.warning(
                    "Failed to clean up orphan extension addendum %s",
                    storage_key,
                )
            raise

    detail = await get_lease(
        user_id=user_id,
        organization_id=organization_id,
        lease_id=lease_id,
    )
    return detail, now


async def undo_extension(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    version_id: uuid.UUID,
) -> SignedLeaseResponse:
    """Roll back a recent extension within the ``UNDO_WINDOW_DAYS`` window.

    Soft-deletes the ``lease_term_versions`` row and recomputes
    ``signed_leases.ends_on`` from the now-latest live version. The
    rendered addendum attachment is intentionally preserved as an audit
    trail — soft-deleted versions still reference it via
    ``source_attachment_id``.

    Raises:
        SignedLeaseNotFoundError: lease not in (user_id, organization_id).
        ExtensionNotFoundError: version_id is not a live row on this lease.
        CannotUndoSeedRowError: version is the seed (would lose original term).
        NotLatestExtensionError: a newer live extension exists; undo is FIFO.
        UndoWindowExpiredError: version was committed >UNDO_WINDOW_DAYS ago.
    """
    now = _dt.datetime.now(_dt.timezone.utc)

    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

        version = await lease_term_version_repo.get(
            db,
            version_id=version_id,
            lease_id=lease_id,
        )
        if version is None:
            raise ExtensionNotFoundError(
                f"Extension {version_id} not found on lease {lease_id}",
            )

        if version.source_attachment_id is None:
            raise CannotUndoSeedRowError(
                "The original lease term cannot be undone — it's not an extension.",
            )

        latest = await lease_term_version_repo.get_latest_extension(
            db, lease_id=lease_id,
        )
        if latest is None or latest.id != version.id:
            raise NotLatestExtensionError(
                "Only the most recent extension can be undone. "
                "Undo the latest extension first if you need to roll back further.",
            )

        age = now - version.created_at
        if age.days >= UNDO_WINDOW_DAYS:
            raise UndoWindowExpiredError(
                f"This extension was committed more than {UNDO_WINDOW_DAYS} "
                "days ago and can no longer be undone.",
            )

        await lease_term_version_repo.soft_delete(db, version=version, now=now)

        # Recompute lease.ends_on from the next-latest live version. If no
        # other extension exists, fall back to the seed row (which always
        # exists for an extended lease — the seed was created at the
        # original signature time per PR 1a's backfill).
        next_latest = await lease_term_version_repo.get_latest_extension(
            db, lease_id=lease_id,
        )
        if next_latest is not None:
            new_ends_on = next_latest.ends_on
        else:
            seed = next(
                (
                    v for v in await lease_term_version_repo.list_by_lease(
                        db, lease_id=lease_id,
                    )
                    if v.source_attachment_id is None
                ),
                None,
            )
            new_ends_on = seed.ends_on if seed is not None else lease.ends_on

        await signed_lease_repo.update_lease(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
            fields={"ends_on": new_ends_on, "updated_at": now},
        )

        await applicant_event_repo.append(
            db,
            applicant_id=lease.applicant_id,
            event_type="extension_undone",
            actor="host",
            occurred_at=now,
            payload={
                "lease_id": str(lease_id),
                "undone_version_id": str(version_id),
                "new_ends_on": new_ends_on.isoformat(),
            },
        )

    return await get_lease(
        user_id=user_id,
        organization_id=organization_id,
        lease_id=lease_id,
    )


def _addendum_filename(new_ends_on: _dt.date) -> str:
    return f"Lease Extension Addendum - through {new_ends_on.isoformat()}.pdf"


def _build_substitutions(
    *,
    applicant,
    property_record,
    user_record,
    original_starts_on: _dt.date,
    original_ends_on: _dt.date,
    new_ends_on: _dt.date,
    notes: str | None,
    effective_date: _dt.date,
) -> dict[str, str]:
    """Build the placeholder-value dict for the addendum render.

    Keys that resolve to None are intentionally omitted so the renderer
    leaves the bracketed placeholder in place — the host can spot the
    missing value at a glance when reviewing the rendered PDF.
    """
    values: dict[str, str] = {
        "ORIGINAL LEASE START DATE": original_starts_on.isoformat(),
        "ORIGINAL LEASE END DATE": original_ends_on.isoformat(),
        "NEW LEASE END DATE": new_ends_on.isoformat(),
        "EFFECTIVE DATE": effective_date.isoformat(),
        "EXTENSION NOTES": notes or "(none)",
    }
    tenant_name = getattr(applicant, "legal_name", None) if applicant else None
    if tenant_name:
        values["TENANT FULL NAME"] = tenant_name
        values["TENANT NAME"] = tenant_name
    address = getattr(property_record, "address", None) if property_record else None
    if address:
        values["PROPERTY ADDRESS"] = address
        values["PREMISES ADDRESS"] = address
    landlord_name = getattr(user_record, "name", None) if user_record else None
    if landlord_name:
        values["LANDLORD FULL NAME"] = landlord_name
        values["LANDLORD NAME"] = landlord_name
    return values
