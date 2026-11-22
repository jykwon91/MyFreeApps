"""Tuning for :mod:`platform_shared.core.capped_upload`."""
from __future__ import annotations

from typing import Final

# Bytes read from an upload per step. Large enough that a normal photo takes a
# handful of reads, small enough that the overshoot past a cap stays tiny.
UPLOAD_READ_CHUNK_BYTES: Final = 1024 * 1024
