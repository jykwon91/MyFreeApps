"""External-ID linkage service for listings.

Per RENTALS_PLAN §5.1, a listing may be paired with up to one external link
per source (FF / TNH / Airbnb / direct). The (listing_id, source) UNIQUE
constraint enforces that. The (source, external_id) partial UNIQUE prevents
two listings from claiming the same external ID — but we surface that
conflict only when both listings live in the same organization, never
across tenants (per RENTALS_PLAN §8 cross-org isolation).

The DB partial UNIQUE on `(source, external_id)` is global (a schema-level
guarantee that's enforced regardless of tenant). To prevent cross-org
existence leakage via differing HTTP status codes (200 vs 409 vs 500),
the service catches `IntegrityError` from the partial UNIQUE and surfaces
the SAME generic 409 message used for same-org collisions. The host
cannot distinguish "another listing of mine has this ID" from "another
tenant has this ID" — both produce identical responses.

This service owns:
- pre-flight conflict detection (mapped to 409 by the route layer)
- listing existence / org-scope check
- update field allowlisting (delegated to the repo's _UPDATABLE_COLUMNS)
- IntegrityError → 409 mapping for cross-tenant collisions
"""
from __future__ import annotations

import uuid

from sqlalchemy.exc import IntegrityError

from app.db.session import unit_of_work
from app.repositories import listing_external_id_repo, listing_repo
from app.schemas.listings.listing_external_id_create_request import (
    ListingExternalIdCreateRequest,
)
from app.schemas.listings.listing_external_id_response import ListingExternalIdResponse
from app.schemas.listings.listing_external_id_update_request import (
    ListingExternalIdUpdateRequest,
)


class ListingNotFoundError(LookupError):
    """Listing missing, soft-deleted, or out of caller's organization."""


class ExternalIdNotFoundError(LookupError):
    """The external-id row does not exist on the supplied listing."""


class SourceAlreadyLinkedError(ValueError):
    """A row already exists for `(listing_id, source)`.

    The route layer maps this to HTTP 409 with a host-readable message.
    """


class ExternalIdAlreadyClaimedError(ValueError):
    """The `(source, external_id)` pair is already claimed.

    Raised in two scenarios that must produce IDENTICAL responses to prevent
    cross-tenant existence leakage:
      1. Same-org collision detected by the pre-flight lookup
         (`find_listing_id_by_source_and_external_id`)
      2. Cross-tenant collision caught from the DB partial UNIQUE
         (the lookup returned None because of org filtering, but the global
         UNIQUE constraint blocked the insert)

    The error message and HTTP status code are identical in both cases —
    the host cannot tell whether the collision is in their own data or
    another tenant's.
    """


async def create_external_id(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    listing_id: uuid.UUID,
    payload: ListingExternalIdCreateRequest,
) -> ListingExternalIdResponse:
    """Create a new external-ID linkage on a listing.

    Conflict order:
      1. Listing missing / out-of-org → 404 (ListingNotFoundError)
      2. (listing_id, source) already exists → 409 (SourceAlreadyLinkedError)
      3. (source, external_id) claimed by another listing in same org → 409
         (ExternalIdAlreadyClaimedError)
    Step 3 is skipped when external_id is None — partial UNIQUE in the DB
    only kicks in for non-NULL external_id values, mirroring the behaviour.
    """
    # Pydantic returns HttpUrl; the column is plain string. Coerce to str so
    # the repo / DB layer never sees a Pydantic-typed value.
    external_url_str = str(payload.external_url) if payload.external_url is not None else None

    async with unit_of_work() as db:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")

        if await listing_external_id_repo.exists_for_source(db, listing.id, payload.source):
            raise SourceAlreadyLinkedError(
                f"This listing is already linked to {payload.source}.",
            )

        if payload.external_id is not None:
            other_listing_id = await listing_external_id_repo.find_listing_id_by_source_and_external_id(
                db, organization_id, payload.source, payload.external_id,
            )
            if other_listing_id is not None:
                raise ExternalIdAlreadyClaimedError(
                    f"This {payload.source} ID is already linked to another listing.",
                )

        try:
            row = await listing_external_id_repo.create(
                db,
                listing_id=listing.id,
                source=payload.source,
                external_id=payload.external_id,
                external_url=external_url_str,
            )
        except IntegrityError as exc:
            # The (source, external_id) partial UNIQUE in the DB is global
            # — a cross-tenant collision passes our org-scoped pre-check
            # but trips this constraint. Map to the same generic 409 as
            # the same-org pre-check so cross-org existence is never
            # leaked via status code or response shape.
            raise ExternalIdAlreadyClaimedError(
                f"This {payload.source} ID is already linked to another listing.",
            ) from exc
        return ListingExternalIdResponse.model_validate(row)


async def update_external_id(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    listing_id: uuid.UUID,
    ext_pk: uuid.UUID,
    payload: ListingExternalIdUpdateRequest,
) -> ListingExternalIdResponse:
    """Apply allowlisted updates to an external-ID linkage.

    Only `external_id` and `external_url` are mutable (see repo
    `_UPDATABLE_COLUMNS`). Switching `source` requires delete + recreate.
    """
    fields = payload.to_update_dict()

    async with unit_of_work() as db:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")

        existing = await listing_external_id_repo.get_by_id(db, ext_pk, listing.id)
        if existing is None:
            raise ExternalIdNotFoundError(f"External ID {ext_pk} not found")

        # If the caller is changing external_id to a non-null value, check
        # the org-scoped (source, external_id) collision against OTHER
        # listings — a no-op-but-included external_id pointing at the same
        # row must not 409 against itself.
        new_external_id = fields.get("external_id", existing.external_id)
        if new_external_id is not None and new_external_id != existing.external_id:
            other_listing_id = await listing_external_id_repo.find_listing_id_by_source_and_external_id(
                db, organization_id, existing.source, new_external_id,
            )
            if other_listing_id is not None and other_listing_id != listing.id:
                raise ExternalIdAlreadyClaimedError(
                    f"This {existing.source} ID is already linked to another listing.",
                )

        try:
            row = await listing_external_id_repo.update(db, listing.id, ext_pk, fields)
        except IntegrityError as exc:
            # See create_external_id docstring: cross-tenant collision via
            # the global partial UNIQUE → generic 409, no status-code leak.
            raise ExternalIdAlreadyClaimedError(
                f"This {existing.source} ID is already linked to another listing.",
            ) from exc
        if row is None:
            # Should be unreachable given the get_by_id check above, but
            # the repo contract permits None — surface a clear error.
            raise ExternalIdNotFoundError(f"External ID {ext_pk} not found")
        return ListingExternalIdResponse.model_validate(row)


async def delete_external_id(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    listing_id: uuid.UUID,
    ext_pk: uuid.UUID,
) -> None:
    """Hard-delete an external-ID linkage.

    Raises ListingNotFoundError or ExternalIdNotFoundError on miss so the
    route can return a clean 404.
    """
    async with unit_of_work() as db:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id)
        if listing is None:
            raise ListingNotFoundError(f"Listing {listing_id} not found")

        deleted = await listing_external_id_repo.delete_by_id(db, listing.id, ext_pk)
        if not deleted:
            raise ExternalIdNotFoundError(f"External ID {ext_pk} not found")
