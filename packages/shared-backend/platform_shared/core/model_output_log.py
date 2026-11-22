"""Describe a model's reply for logs without writing any of its text.

A reply that fails to parse still carries what the model read: invoice and
tax figures, resume names and contact details. Its length, why the model
stopped and a short hash are enough to tell a truncated reply (``max_tokens``)
from a malformed one, and to match repeats of the same reply.
"""
from __future__ import annotations

import hashlib

MODEL_OUTPUT_HASH_CHARS = 12


def describe_model_output(text: str, *, stop_reason: str | None) -> str:
    """The reply's length, stop reason and the first 12 hex digits of its SHA-256."""
    digest = hashlib.sha256(text.encode("utf-8", "surrogatepass")).hexdigest()[:MODEL_OUTPUT_HASH_CHARS]
    return f"chars={len(text)} stop_reason={stop_reason or 'unknown'} sha256={digest}"


__all__ = ["MODEL_OUTPUT_HASH_CHARS", "describe_model_output"]
