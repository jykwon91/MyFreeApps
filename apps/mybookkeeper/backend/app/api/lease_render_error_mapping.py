"""HTTP status mapping for failures while rendering and writing lease documents."""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException
from platform_shared.core.storage import StorageNotConfiguredError

from app.core.lease_render_constants import (
    LEASE_ATTACHMENT_LOCKED_CODE,
    LEASE_ATTACHMENT_LOCKED_MESSAGE,
    LEASE_CHANGED_DURING_RENDER_DETAIL,
    LEASE_DOCUMENTS_LOCKED_CODE,
    LEASE_DOCUMENTS_LOCKED_MESSAGE,
    LEASE_VALUE_LOCKED_CODE,
    LEASE_VALUE_LOCKED_MESSAGE,
)
from app.core.stored_file_constants import MISSING_TEMPLATE_FILE_DETAIL
from app.services.leases.exceptions.lease_attachment_locked_error import LeaseAttachmentLockedError
from app.services.leases.exceptions.lease_changed_during_render_error import (
    LeaseChangedDuringRenderError,
)
from app.services.leases.exceptions.lease_documents_locked_error import LeaseDocumentsLockedError
from app.services.leases.exceptions.lease_value_locked_error import LeaseValueLockedError
from app.services.leases.exceptions.template_storage_unavailable_error import (
    TemplateStorageUnavailableError,
)
from app.services.leases._lease_helpers import CannotEditValuesError
from app.services.storage.stored_file import StoredFileMissingError


@contextmanager
def lease_attachment_lock_errors() -> Iterator[None]:
    """409 with a machine code when a sent or signed lease's record files would change."""
    try:
        yield
    except LeaseAttachmentLockedError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": LEASE_ATTACHMENT_LOCKED_CODE, "message": LEASE_ATTACHMENT_LOCKED_MESSAGE},
        ) from exc


@contextmanager
def lease_render_errors() -> Iterator[None]:
    """409 for a vanished template object, a lease changed mid-render or locked documents; 503 for storage trouble."""
    try:
        yield
    except StoredFileMissingError as exc:
        raise HTTPException(status_code=409, detail=MISSING_TEMPLATE_FILE_DETAIL) from exc
    except LeaseChangedDuringRenderError as exc:
        raise HTTPException(status_code=409, detail=LEASE_CHANGED_DURING_RENDER_DETAIL) from exc
    except LeaseDocumentsLockedError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": LEASE_DOCUMENTS_LOCKED_CODE, "message": LEASE_DOCUMENTS_LOCKED_MESSAGE},
        ) from exc
    except LeaseValueLockedError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": LEASE_VALUE_LOCKED_CODE, "message": LEASE_VALUE_LOCKED_MESSAGE, "keys": exc.keys},
        ) from exc
    except CannotEditValuesError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": LEASE_VALUE_LOCKED_CODE, "message": LEASE_VALUE_LOCKED_MESSAGE, "keys": []},
        ) from exc
    except (TemplateStorageUnavailableError, StorageNotConfiguredError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
