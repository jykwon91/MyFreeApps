"""Which exceptions from a storage call mean storage is unavailable.

``StorageClient`` lets minio-py's and urllib3's errors through unchanged, so
every caller that maps an outage to a response catches this one tuple instead of
naming the minio and urllib3 types itself:

* ``MinioException``: ``S3Error`` (MinIO answered with an S3 error code, e.g.
  ``SlowDown`` or ``AccessDenied``) and minio-py's errors for a reply that isn't
  S3 XML (a non-XML 5xx from a proxy, or a 5xx to a HEAD).
* ``urllib3.exceptions.HTTPError``: MinIO couldn't be reached, or a connection
  broke mid-reply.
* ``OSError``: socket-level failures that reach the caller unwrapped.

Callers that treat a missing object differently check ``S3Error`` codes against
``STORAGE_MISSING_OBJECT_CODES`` first.
"""
from __future__ import annotations

from typing import Final

import urllib3
from minio.error import InvalidResponseError, MinioException, S3Error, ServerError

STORAGE_UNAVAILABLE_ERRORS: Final[tuple[type[Exception], ...]] = (
    MinioException,
    urllib3.exceptions.HTTPError,
    OSError,
)



def storage_error_code(exc: BaseException) -> str:
    """MinIO's S3 error code, or the exception's type name when it has none."""
    if isinstance(exc, S3Error) and exc.code:
        return exc.code
    return type(exc).__name__


def describe_storage_error(exc: BaseException) -> str:
    """A log-safe description: type, plus S3 code or HTTP status when known.

    A reply that isn't S3 XML is described by its type alone: minio-py exposes
    nothing public about it but a message that embeds the body, which can be a
    whole proxy error page.
    """
    if isinstance(exc, S3Error):
        return f"S3Error code={exc.code} message={exc.message}"
    if isinstance(exc, ServerError):
        return f"ServerError status={exc.status_code}"
    if isinstance(exc, InvalidResponseError):
        return "InvalidResponseError"
    return f"{type(exc).__name__}: {exc}"


__all__ = ["STORAGE_UNAVAILABLE_ERRORS", "describe_storage_error", "storage_error_code"]
