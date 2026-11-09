"""HTTP status mapping for failures while rendering and writing lease documents."""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException
from platform_shared.core.storage import StorageNotConfiguredError

from app.core.lease_render_constants import LEASE_CHANGED_DURING_RENDER_DETAIL
from app.core.stored_file_constants import MISSING_TEMPLATE_FILE_DETAIL
from app.services.leases.exceptions.lease_changed_during_render_error import (
    LeaseChangedDuringRenderError,
)
from app.services.leases.exceptions.template_storage_unavailable_error import (
    TemplateStorageUnavailableError,
)
from app.services.storage.stored_file import StoredFileMissingError


@contextmanager
def lease_render_errors() -> Iterator[None]:
    """409 for a vanished template object or a lease changed mid-render; 503 for storage trouble."""
    try:
        yield
    except StoredFileMissingError as exc:
        raise HTTPException(status_code=409, detail=MISSING_TEMPLATE_FILE_DETAIL) from exc
    except LeaseChangedDuringRenderError as exc:
        raise HTTPException(status_code=409, detail=LEASE_CHANGED_DURING_RENDER_DETAIL) from exc
    except (TemplateStorageUnavailableError, StorageNotConfiguredError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
