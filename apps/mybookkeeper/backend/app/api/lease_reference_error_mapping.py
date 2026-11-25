"""HTTP status mapping for a lease that names an applicant, listing or house it may not."""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException

from app.core.lease_property_constants import (
    LEASE_PROPERTY_NOT_FOUND_DETAIL,
    LISTING_PROPERTY_MISMATCH_CODE,
    LISTING_PROPERTY_MISMATCH_MESSAGE,
)
from app.services.leases._lease_helpers import (
    ApplicantNotFoundError,
    ListingNotFoundError,
)
from app.services.leases.exceptions.lease_property_not_found_error import (
    LeasePropertyNotFoundError,
)
from app.services.leases.exceptions.listing_property_mismatch_error import (
    ListingPropertyMismatchError,
)


@contextmanager
def lease_reference_errors() -> Iterator[None]:
    """404 for another tenant's applicant, listing or house; 422 when the listing and house disagree."""
    try:
        yield
    except ApplicantNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Applicant not found") from exc
    except ListingNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Listing not found") from exc
    except LeasePropertyNotFoundError as exc:
        raise HTTPException(status_code=404, detail=LEASE_PROPERTY_NOT_FOUND_DETAIL) from exc
    except ListingPropertyMismatchError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": LISTING_PROPERTY_MISMATCH_CODE, "message": LISTING_PROPERTY_MISMATCH_MESSAGE},
        ) from exc
