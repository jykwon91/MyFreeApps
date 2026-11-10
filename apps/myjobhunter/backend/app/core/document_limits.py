"""Column-length limits for the ``documents`` table.

Single source for both the ``Document`` model's ``String(N)`` columns and the
request schemas / upload form parameters that feed them, so a value the API
accepts can never exceed what the column stores.
"""
from __future__ import annotations

DOCUMENT_TITLE_MAX_LEN = 255
DOCUMENT_FILENAME_MAX_LEN = 255
DOCUMENT_CONTENT_TYPE_MAX_LEN = 100
