"""Reply-template service — orchestration for the per-user template library.

Per the layered-architecture rule: services orchestrate (load → decide →
persist), repositories own queries.

Responsibilities:
- ``ensure_default_templates_for_user`` seeds three starter templates the
  first time the host visits the templates UI. Idempotent via the per-user
  UNIQUE on ``name`` — running it again is a no-op.
- ``list_templates`` returns the user's templates, calling the seed helper
  on every call so first-time hosts see something to pick from.
- CRUD: create, update, archive (soft-delete via ``is_archived``).
- ``render_for_inquiry`` loads inquiry + linked listing + host context and
  delegates pure substitution to ``reply_template_renderer``.
"""
from __future__ import annotations

import uuid

from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import (
    inquiry_repo,
    listing_repo,
    reply_template_repo,
)
from app.repositories.user import user_repo
from app.schemas.inquiries.rendered_template_response import RenderedTemplateResponse
from app.schemas.inquiries.reply_template_create_request import (
    ReplyTemplateCreateRequest,
)
from app.schemas.inquiries.reply_template_response import ReplyTemplateResponse
from app.schemas.inquiries.reply_template_update_request import (
    ReplyTemplateUpdateRequest,
)
from app.services.inquiries import reply_template_renderer

# Default templates seeded on first use. Bodies use the same variable names
# as the renderer's allowlist. The dog-disclosure auto-prepend (RENTALS_PLAN
# §9.3) happens at render time — never store the disclosure in the template.
_DEFAULT_TEMPLATES: tuple[dict[str, str | int], ...] = (
    {
        "name": "Initial inquiry reply",
        "subject_template": "Re: Your inquiry about $listing",
        "body_template": (
            "Hi $name,\n\n"
            "Thanks for reaching out about $listing. I'd love to host you for $dates.\n\n"
            "A few quick details:\n"
            "- Furnished room with private or shared bath (let me know which works for you)\n"
            "- Quiet, professional household\n"
            "- House rules attached on request\n\n"
            "Would you like to schedule a quick video call so I can show you the space?\n\n"
            "Best,\n"
            "$host_name"
        ),
        "display_order": 0,
    },
    {
        "name": "Polite decline",
        "subject_template": "Re: Your inquiry about $listing",
        "body_template": (
            "Hi $name,\n\n"
            "Thanks for reaching out about $listing. Unfortunately, $dates "
            "doesn't work on my end — the room is booked during that window.\n\n"
            "I'd be happy to keep your contact and let you know if anything opens up.\n\n"
            "Best,\n"
            "$host_name"
        ),
        "display_order": 1,
    },
    {
        "name": "Welcome packet",
        "subject_template": "Welcome — your stay at $listing",
        "body_template": (
            "Hi $name,\n\n"
            "Welcome! I'm looking forward to hosting you from $start_date to $end_date.\n\n"
            "Move-in details and house rules are below. Please reply with any questions.\n\n"
            "Best,\n"
            "$host_name"
        ),
        "display_order": 2,
    },
)


async def ensure_default_templates_for_user(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Seed the three default templates iff they don't already exist.

    Idempotent — relies on the ``UNIQUE (user_id, name)`` constraint to skip
    already-seeded names. Safe to call on every templates list fetch.
    """
    async with unit_of_work() as db:
        for spec in _DEFAULT_TEMPLATES:
            name = spec["name"]
            assert isinstance(name, str)
            existing = await reply_template_repo.find_by_user_and_name(
                db, user_id, name,
            )
            if existing is not None:
                continue
            subject = spec["subject_template"]
            body = spec["body_template"]
            display_order = spec["display_order"]
            assert isinstance(subject, str)
            assert isinstance(body, str)
            assert isinstance(display_order, int)
            await reply_template_repo.create(
                db,
                organization_id=organization_id,
                user_id=user_id,
                name=name,
                subject_template=subject,
                body_template=body,
                display_order=display_order,
            )


async def list_templates(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[ReplyTemplateResponse]:
    """List active templates for a user. Seeds defaults on first call."""
    await ensure_default_templates_for_user(organization_id, user_id)
    async with AsyncSessionLocal() as db:
        templates = await reply_template_repo.list_by_user(
            db, organization_id, user_id, include_archived=False,
        )
    return [ReplyTemplateResponse.model_validate(t) for t in templates]


async def create_template(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ReplyTemplateCreateRequest,
) -> ReplyTemplateResponse:
    async with unit_of_work() as db:
        template = await reply_template_repo.create(
            db,
            organization_id=organization_id,
            user_id=user_id,
            name=payload.name,
            subject_template=payload.subject_template,
            body_template=payload.body_template,
            display_order=payload.display_order,
        )
    return ReplyTemplateResponse.model_validate(template)


async def update_template(
    user_id: uuid.UUID,
    template_id: uuid.UUID,
    payload: ReplyTemplateUpdateRequest,
) -> ReplyTemplateResponse:
    fields = payload.to_update_dict()
    async with unit_of_work() as db:
        template = await reply_template_repo.update_template(
            db, template_id, user_id, fields,
        )
        if template is None:
            raise LookupError(f"Reply template {template_id} not found")
    return ReplyTemplateResponse.model_validate(template)


async def archive_template(
    user_id: uuid.UUID,
    template_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        archived = await reply_template_repo.archive(db, template_id, user_id)
        if not archived:
            raise LookupError(f"Reply template {template_id} not found")


def _resolve_host_name(user) -> str:  # type: ignore[no-untyped-def]
    """Pick a sensible host name for ``$host_name`` substitution.

    ``User.name`` is the only display-name column today (no ``first_name``).
    Fall back to the local part of the email if no name is set, then to
    "Your host" as a last resort. The caller's actual Gmail address is
    used for the ``From`` header — this is purely for the message body.
    """
    raw_name = getattr(user, "name", None)
    if isinstance(raw_name, str) and raw_name.strip():
        return raw_name.strip()
    email = getattr(user, "email", None)
    if isinstance(email, str) and "@" in email:
        return email.split("@", 1)[0]
    return "Your host"


async def render_for_inquiry(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID,
    template_id: uuid.UUID,
) -> RenderedTemplateResponse:
    """Resolve template + inquiry + listing + user, then render."""
    async with AsyncSessionLocal() as db:
        template = await reply_template_repo.get_by_id_and_user(
            db, template_id, user_id,
        )
        if template is None:
            raise LookupError(f"Reply template {template_id} not found")

        inquiry = await inquiry_repo.get_by_id(db, inquiry_id, organization_id)
        if inquiry is None:
            raise LookupError(f"Inquiry {inquiry_id} not found")

        listing_title: str | None = None
        listing_pets_on_premises = False
        listing_large_dog_disclosure: str | None = None
        if inquiry.listing_id is not None:
            listing = await listing_repo.get_by_id(
                db, inquiry.listing_id, organization_id,
            )
            if listing is not None:
                listing_title = listing.title
                listing_pets_on_premises = bool(listing.pets_on_premises)
                listing_large_dog_disclosure = listing.large_dog_disclosure

        user = await user_repo.get_by_id(db, user_id)
        if user is None:
            raise LookupError(f"User {user_id} not found")

    host_name = _resolve_host_name(user)
    subject, body = reply_template_renderer.render_template(
        template_subject=template.subject_template,
        template_body=template.body_template,
        inquirer_name=inquiry.inquirer_name,
        inquirer_employer=inquiry.inquirer_employer,
        listing_title=listing_title,
        listing_pets_on_premises=listing_pets_on_premises,
        listing_large_dog_disclosure=listing_large_dog_disclosure,
        desired_start_date=inquiry.desired_start_date,
        desired_end_date=inquiry.desired_end_date,
        host_name=host_name,
        host_phone=None,
    )
    return RenderedTemplateResponse(subject=subject, body=body)
