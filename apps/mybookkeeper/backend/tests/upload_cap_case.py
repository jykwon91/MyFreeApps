"""One upload endpoint, described for the capped-read tests in test_upload_read_caps.py."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import pytest


@dataclass(frozen=True)
class UploadCapCase:
    """How to call an upload endpoint, set its limit, and find the bytes its service got.

    ``set_limit`` sets the endpoint's size limit to the given number of bytes.
    ``too_large_detail`` is the detail the endpoint answers for an oversized
    file named ``filename`` under that limit. ``received`` pulls the uploaded
    bytes out of the service mock's call ``(args, kwargs)``.
    """

    id: str
    method: str
    path: str
    service: str
    set_limit: Callable[[pytest.MonkeyPatch, int], None]
    too_large_detail: Callable[[int], str]
    received: Callable[[tuple[Any, ...], dict[str, Any]], bytes]
    file_field: str = "file"
    filename: str = "upload.pdf"
    form: dict[str, str] = field(default_factory=dict)
    too_large_status: int = 413
