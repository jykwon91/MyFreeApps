"""Lease, listing and welcome-manual writes are audited, as the signed-in user.

These repositories used to change rows with bulk ``UPDATE`` / ``DELETE``
statements, which the audit listener never sees. Each case runs one write and
checks it left audit rows for the row it changed, naming the actor.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.lease_enums import (
    LEASE_ATTACHMENT_KINDS,
    LEASE_KINDS,
    LEASE_PLACEHOLDER_INPUT_TYPES,
    SIGNED_LEASE_STATUSES,
)
from app.core.listing_enums import LISTING_EXTERNAL_SOURCES, LISTING_ROOM_TYPES, LISTING_STATUSES
from app.models.leases.lease_template import LeaseTemplate
from app.models.leases.lease_template_file import LeaseTemplateFile
from app.models.leases.lease_template_placeholder import LeaseTemplatePlaceholder
from app.models.leases.pending_rent_receipt import PendingRentReceipt
from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.models.leases.signed_lease_template import SignedLeaseTemplate
from app.models.listings.channel_listing import ChannelListing
from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout
from app.models.listings.listing_blackout_attachment import ListingBlackoutAttachment
from app.models.listings.listing_external_id import ListingExternalId
from app.models.listings.listing_photo import ListingPhoto
from app.models.welcome_manuals.welcome_manual import WelcomeManual
from app.models.welcome_manuals.welcome_manual_place import WelcomeManualPlace
from app.models.welcome_manuals.welcome_manual_room import WelcomeManualRoom
from app.models.welcome_manuals.welcome_manual_section import WelcomeManualSection
from app.models.welcome_manuals.welcome_manual_section_field import WelcomeManualSectionField
from app.models.welcome_manuals.welcome_manual_section_image import WelcomeManualSectionImage
from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
    pending_rent_receipt_repo,
    signed_lease_attachment_repo,
    signed_lease_repo,
    signed_lease_template_repo,
)
from app.repositories.listings import (
    channel_listing_repo,
    listing_blackout_attachment_repo,
    listing_blackout_repo,
    listing_external_id_repo,
    listing_photo_repo,
    listing_repo,
)
from app.repositories.welcome_manuals import (
    welcome_manual_place_repo,
    welcome_manual_repo,
    welcome_manual_room_repo,
    welcome_manual_section_field_repo,
    welcome_manual_section_image_repo,
    welcome_manual_section_repo,
)
from tests.audited_row_factory import AuditedWriteCase, make_row, run_audited_write_case

ORG = uuid.uuid4()
USER = uuid.uuid4()
NOW = _dt.datetime(2026, 11, 1, 12, 0, tzinfo=_dt.UTC)
SENDING = {"status": "sending", "send_message_id": "claim-1", "send_claimed_at": NOW}


def _owned(model: type, **fields: object):  # type: ignore[no-untyped-def]
    async def seed(db: AsyncSession):  # type: ignore[no-untyped-def]
        return await make_row(db, model, organization_id=ORG, user_id=USER, **fields)
    return seed


def _row(model: type, **fields: object):  # type: ignore[no-untyped-def]
    async def seed(db: AsyncSession):  # type: ignore[no-untyped-def]
        return await make_row(db, model, **fields)
    return seed


_LEASE = {"status": SIGNED_LEASE_STATUSES[0], "kind": LEASE_KINDS[0]}
_STAY = {"starts_on": _dt.date(2026, 12, 1), "ends_on": _dt.date(2026, 12, 5)}
_LISTING = {"room_type": LISTING_ROOM_TYPES[0], "status": LISTING_STATUSES[0]}

CASES = [
    # Leases
    AuditedWriteCase(
        "lease_template.bump_version", _owned(LeaseTemplate, version=3),
        lambda db, row: lease_template_repo.bump_version(
            db, template_id=row.id, user_id=USER, organization_id=ORG,
        ),
        "UPDATE", frozenset({"version"}),
    ),
    AuditedWriteCase(
        "lease_template.soft_delete", _owned(LeaseTemplate),
        lambda db, row: lease_template_repo.soft_delete(
            db, template_id=row.id, user_id=USER, organization_id=ORG,
        ),
        "UPDATE", frozenset({"deleted_at"}),
    ),
    AuditedWriteCase(
        "lease_template_file.delete_all_for_template", _row(LeaseTemplateFile),
        lambda db, row: lease_template_file_repo.delete_all_for_template(db, template_id=row.template_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "lease_template_placeholder.delete_all_for_template",
        _row(LeaseTemplatePlaceholder, input_type=LEASE_PLACEHOLDER_INPUT_TYPES[0]),
        lambda db, row: lease_template_placeholder_repo.delete_all_for_template(db, template_id=row.template_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "signed_lease.soft_delete", _owned(SignedLease, **_LEASE),
        lambda db, row: signed_lease_repo.soft_delete(db, lease_id=row.id, user_id=USER, organization_id=ORG),
        "UPDATE", frozenset({"deleted_at"}),
    ),
    AuditedWriteCase(
        "signed_lease.restore_last_emailed_if_unchanged",
        _owned(SignedLease, last_emailed_to_tenant_at=NOW, **_LEASE),
        lambda db, row: signed_lease_repo.restore_last_emailed_if_unchanged(
            db, lease_id=row.id, user_id=USER, organization_id=ORG, expected=NOW, restore_to=None,
        ),
        "UPDATE", frozenset({"last_emailed_to_tenant_at"}),
    ),
    AuditedWriteCase(
        "signed_lease_template.record_render_snapshot",
        _row(SignedLeaseTemplate, lease_id=uuid.uuid4(), template_id=uuid.uuid4()),
        lambda db, row: signed_lease_template_repo.record_render_snapshot(
            db, lease_id=row.lease_id, template_id=row.template_id, template_name="Room lease", template_version=4,
        ),
        "UPDATE", frozenset({"template_name_snapshot", "template_version_snapshot"}),
    ),
    AuditedWriteCase(
        "signed_lease_attachment.update_kind_scoped_to_lease",
        _row(SignedLeaseAttachment, kind=LEASE_ATTACHMENT_KINDS[0]),
        lambda db, row: signed_lease_attachment_repo.update_kind_scoped_to_lease(
            db, row.id, row.lease_id, LEASE_ATTACHMENT_KINDS[1],
        ),
        "UPDATE", frozenset({"kind"}),
    ),
    AuditedWriteCase(
        "signed_lease_attachment.update_signing_state_scoped_to_lease",
        _row(SignedLeaseAttachment, kind=LEASE_ATTACHMENT_KINDS[0]),
        lambda db, row: signed_lease_attachment_repo.update_signing_state_scoped_to_lease(
            db, row.id, row.lease_id, {"emailed_to_tenant_at": NOW},
        ),
        "UPDATE", frozenset({"emailed_to_tenant_at"}),
    ),
    AuditedWriteCase(
        "signed_lease_attachment.delete_by_id_scoped_to_lease",
        _row(SignedLeaseAttachment, kind=LEASE_ATTACHMENT_KINDS[0]),
        lambda db, row: signed_lease_attachment_repo.delete_by_id_scoped_to_lease(db, row.id, row.lease_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "signed_lease_attachment.set_emailed_to_tenant_at",
        _row(SignedLeaseAttachment, kind=LEASE_ATTACHMENT_KINDS[0]),
        lambda db, row: signed_lease_attachment_repo.set_emailed_to_tenant_at(
            db, lease_id=row.lease_id, stamps={row.id: NOW},
        ),
        "UPDATE", frozenset({"emailed_to_tenant_at"}),
    ),
    AuditedWriteCase(
        "signed_lease_attachment.restore_emailed_to_tenant_at_if_unchanged",
        _row(SignedLeaseAttachment, kind=LEASE_ATTACHMENT_KINDS[0], emailed_to_tenant_at=NOW),
        lambda db, row: signed_lease_attachment_repo.restore_emailed_to_tenant_at_if_unchanged(
            db, lease_id=row.lease_id, expected=NOW, stamps={row.id: None},
        ),
        "UPDATE", frozenset({"emailed_to_tenant_at"}),
    ),
    # Rent receipts
    AuditedWriteCase(
        "pending_rent_receipt.claim_for_send", _owned(PendingRentReceipt, status="pending"),
        lambda db, row: pending_rent_receipt_repo.claim_for_send(
            db, transaction_id=row.transaction_id, organization_id=ORG, send_message_id="claim-1",
            sender_gmail_address="host@example.com", claimed_at=NOW,
        ),
        "UPDATE", frozenset({"status", "send_message_id", "send_claimed_at"}),
    ),
    AuditedWriteCase(
        "pending_rent_receipt.set_attempt_attachment", _owned(PendingRentReceipt, **SENDING),
        lambda db, row: pending_rent_receipt_repo.set_attempt_attachment(
            db, receipt_id=row.id, organization_id=ORG, send_message_id="claim-1", attachment_id=uuid.uuid4(),
        ),
        "UPDATE", frozenset({"sent_via_attachment_id"}),
    ),
    AuditedWriteCase(
        "pending_rent_receipt.mark_sent_if_claimed", _owned(PendingRentReceipt, **SENDING),
        lambda db, row: pending_rent_receipt_repo.mark_sent_if_claimed(
            db, receipt_id=row.id, organization_id=ORG, send_message_id="claim-1", sent_at=NOW,
        ),
        "UPDATE", frozenset({"status", "sent_at"}),
    ),
    AuditedWriteCase(
        "pending_rent_receipt.release_claim", _owned(PendingRentReceipt, **SENDING),
        lambda db, row: pending_rent_receipt_repo.release_claim(
            db, receipt_id=row.id, organization_id=ORG, send_message_id="claim-1", released_at=NOW,
        ),
        "UPDATE", frozenset({"status", "send_message_id", "send_claimed_at"}),
    ),
    AuditedWriteCase(
        "pending_rent_receipt.mark_dismissed_if_pending", _owned(PendingRentReceipt, status="pending"),
        lambda db, row: pending_rent_receipt_repo.mark_dismissed_if_pending(
            db, transaction_id=row.transaction_id, organization_id=ORG, dismissed_at=NOW,
        ),
        "UPDATE", frozenset({"status"}),
    ),
    AuditedWriteCase(
        "pending_rent_receipt.dismiss_pending_for_transactions", _owned(PendingRentReceipt, status="pending"),
        lambda db, row: pending_rent_receipt_repo.dismiss_pending_for_transactions(
            db, transaction_ids=[row.transaction_id], organization_id=ORG, dismissed_at=NOW,
        ),
        "UPDATE", frozenset({"status"}),
    ),
    AuditedWriteCase(
        "pending_rent_receipt.mark_dismissed_if_claimed", _owned(PendingRentReceipt, **SENDING),
        lambda db, row: pending_rent_receipt_repo.mark_dismissed_if_claimed(
            db, receipt_id=row.id, organization_id=ORG, send_message_id="claim-1", dismissed_at=NOW,
        ),
        "UPDATE", frozenset({"status"}),
    ),
    AuditedWriteCase(
        "pending_rent_receipt.move_to_transaction", _owned(PendingRentReceipt, status="pending"),
        lambda db, row: pending_rent_receipt_repo.move_to_transaction(
            db, from_transaction_id=row.transaction_id, to_transaction_id=uuid.uuid4(), organization_id=ORG,
        ),
        "UPDATE", frozenset({"transaction_id"}),
    ),
    # Listings
    AuditedWriteCase(
        "listing.soft_delete_by_id", _owned(Listing, **_LISTING),
        lambda db, row: listing_repo.soft_delete_by_id(db, row.id, ORG),
        "UPDATE", frozenset({"deleted_at"}),
    ),
    AuditedWriteCase(
        "channel_listing.delete_by_id", _row(ChannelListing),
        lambda db, row: channel_listing_repo.delete_by_id(db, row.id, row.listing_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "listing_external_id.delete_by_id", _row(ListingExternalId, source=LISTING_EXTERNAL_SOURCES[0]),
        lambda db, row: listing_external_id_repo.delete_by_id(db, row.listing_id, row.id),
        "DELETE",
    ),
    AuditedWriteCase(
        "listing_photo.delete_by_id", _row(ListingPhoto),
        lambda db, row: listing_photo_repo.delete_by_id(db, row.id, row.listing_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "listing_blackout.delete_missing_uids", _row(ListingBlackout, source="airbnb", source_event_id="gone", **_STAY),
        lambda db, row: listing_blackout_repo.delete_missing_uids(
            db, listing_id=row.listing_id, source="airbnb", keep_uids={"still-there"},
        ),
        "DELETE",
    ),
    AuditedWriteCase(
        "listing_blackout.delete_by_listing_and_source", _row(ListingBlackout, source="airbnb", **_STAY),
        lambda db, row: listing_blackout_repo.delete_by_listing_and_source(db, row.listing_id, "airbnb"),
        "DELETE",
    ),
    AuditedWriteCase(
        "listing_blackout_attachment.delete_by_id_scoped_to_blackout", _row(ListingBlackoutAttachment),
        lambda db, row: listing_blackout_attachment_repo.delete_by_id_scoped_to_blackout(
            db, row.id, row.listing_blackout_id,
        ),
        "DELETE",
    ),
    # Welcome manuals
    AuditedWriteCase(
        "welcome_manual.soft_delete_by_id", _owned(WelcomeManual),
        lambda db, row: welcome_manual_repo.soft_delete_by_id(db, row.id, ORG),
        "UPDATE", frozenset({"deleted_at"}),
    ),
    AuditedWriteCase(
        "welcome_manual.clear_share", _owned(WelcomeManual, share_token="tok", share_pin="1234"),
        lambda db, row: welcome_manual_repo.clear_share(db, row.id, ORG),
        "UPDATE", frozenset({"share_token", "share_pin"}),
    ),
    AuditedWriteCase(
        "welcome_manual_place.delete_by_id", _row(WelcomeManualPlace),
        lambda db, row: welcome_manual_place_repo.delete_by_id(db, row.id, row.manual_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "welcome_manual_room.delete_by_id", _row(WelcomeManualRoom),
        lambda db, row: welcome_manual_room_repo.delete_by_id(db, row.id, row.manual_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "welcome_manual_section.delete_by_id", _row(WelcomeManualSection),
        lambda db, row: welcome_manual_section_repo.delete_by_id(db, row.id, row.manual_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "welcome_manual_section_field.delete_by_id", _row(WelcomeManualSectionField),
        lambda db, row: welcome_manual_section_field_repo.delete_by_id(db, row.id, row.section_id),
        "DELETE",
    ),
    AuditedWriteCase(
        "welcome_manual_section_image.delete_by_id", _row(WelcomeManualSectionImage),
        lambda db, row: welcome_manual_section_image_repo.delete_by_id(db, row.id, row.section_id),
        "DELETE",
    ),
]


@pytest.mark.usefixtures("audit_listeners")
@pytest.mark.parametrize("case", CASES, ids=[case.name for case in CASES])
async def test_write_is_audited_as_the_actor(db: AsyncSession, case: AuditedWriteCase) -> None:
    await run_audited_write_case(db, case, actor=USER)
