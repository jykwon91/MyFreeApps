"""Placeholder pre-fill service for signed lease addendum forms.

Resolves placeholder default values for a given lease + template set so
the host's "add addendum" form arrives mostly pre-filled. Kept separate
from ``lease_pdf_service`` to reduce that module's size and to reflect the
distinct responsibility: read-only resolution vs. mutation + PDF rendering.
"""
from __future__ import annotations

import logging
import uuid

from app.db.session import unit_of_work
from app.repositories.leases import (
    lease_template_placeholder_repo,
    lease_template_repo,
    signed_lease_repo,
)
from app.schemas.leases.signed_lease_template_prefill_response import (
    SignedLeaseTemplatePrefillItem,
    SignedLeaseTemplatePrefillResponse,
)
from app.services.leases._lease_helpers import (
    SignedLeaseNotFoundError,
    _load_resolution_context,
)
from app.services.leases.default_source_resolver import resolve_default_source
from app.services.leases.lease_template_service import TemplateNotFoundError

logger = logging.getLogger(__name__)


async def prefill_addendum_placeholders(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    template_ids: list[uuid.UUID],
) -> SignedLeaseTemplatePrefillResponse:
    """Compute resolved + unresolved placeholder values for a template + lease pair.

    Walks the placeholders for the requested templates (deduped) and resolves
    each via ``default_source`` against the parent lease, its applicant /
    inquiry, the linked property, and the host user. Returns one row per
    placeholder so the frontend can render a values form that is mostly
    pre-filled and editable, with empty inputs for genuinely unknown fields.

    Skips placeholders with ``input_type`` of ``signature`` or ``computed``.
    """
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

        for tid in template_ids:
            template = await lease_template_repo.get(
                db,
                template_id=tid,
                user_id=user_id,
                organization_id=organization_id,
            )
            if template is None:
                raise TemplateNotFoundError(f"Template {tid} not found")

        placeholders: list = []
        seen_keys: set[str] = set()
        for tid in template_ids:
            for p in await lease_template_placeholder_repo.list_for_template(
                db, template_id=tid,
            ):
                if p.key in seen_keys:
                    continue
                seen_keys.add(p.key)
                placeholders.append(p)

        applicant, inquiry, property_record, user_record = (
            await _load_resolution_context(
                db,
                lease=lease,
                organization_id=organization_id,
                user_id=user_id,
            )
        )

        existing_values = lease.values or {}

        items: list[SignedLeaseTemplatePrefillItem] = []
        for p in placeholders:
            if p.input_type in ("signature", "computed"):
                continue

            existing = existing_values.get(p.key)
            if existing not in (None, ""):
                items.append(
                    SignedLeaseTemplatePrefillItem(
                        key=p.key,
                        display_label=p.display_label,
                        input_type=p.input_type,
                        required=p.required,
                        value=str(existing),
                        provenance=None,
                        is_from_existing_values=True,
                    )
                )
                continue

            value: str = ""
            provenance: str | None = None
            if p.default_source:
                try:
                    resolved, prov = resolve_default_source(
                        p.default_source,
                        applicant,
                        inquiry,
                        lease=lease,
                        property_record=property_record,
                        user_record=user_record,
                    )
                    if resolved is not None and resolved != "":
                        value = str(resolved)
                        provenance = prov
                except (ValueError, AttributeError):
                    logger.warning(
                        "default_source resolution failed for placeholder %s",
                        p.key, exc_info=True,
                    )

            items.append(
                SignedLeaseTemplatePrefillItem(
                    key=p.key,
                    display_label=p.display_label,
                    input_type=p.input_type,
                    required=p.required,
                    value=value,
                    provenance=provenance,
                )
            )

    return SignedLeaseTemplatePrefillResponse(items=items)
