"""HTTP tuning for the MinIO/S3 client built in ``platform_shared.core.storage``.

minio-py's own default is a 5-minute connect AND read timeout with 5 retries,
so an unreachable or stalled MinIO can block a caller for ~30 minutes. MinIO
runs on the same docker network as the app, so a healthy one answers in
milliseconds; these bound a failure to well under a minute or two.
"""
from __future__ import annotations

from typing import Final

# Seconds to open a TCP connection to MinIO.
STORAGE_CONNECT_TIMEOUT_SECONDS: Final = 5.0

# Seconds of silence allowed between bytes of a response — not a cap on a
# whole transfer, so large uploads/downloads are unaffected while bytes flow.
STORAGE_READ_TIMEOUT_SECONDS: Final = 60.0

# Retries for connection errors and the 5xx statuses below (urllib3 retries
# only idempotent methods on read errors). Fewer than minio-py's default 5:
# each retry can wait a full timeout.
STORAGE_MAX_RETRIES: Final = 3
STORAGE_RETRY_BACKOFF_FACTOR: Final = 0.2
STORAGE_RETRY_STATUS_CODES: Final = (500, 502, 503, 504)

# Pooled connections per host, as minio-py's default.
STORAGE_POOL_MAXSIZE: Final = 10
