"""The error :class:`~platform_shared.core.encrypted_string_type.EncryptedString` raises on a bad ciphertext."""
from __future__ import annotations


class EncryptedColumnDecryptError(RuntimeError):
    """A stored ciphertext didn't decrypt: corrupted, tampered with, or under another key.

    An operator fault, never a client one. It is deliberately not a
    ``ValueError`` or ``LookupError``: routes map those to 4xx replies that
    echo the message, and loading a row happens inside those handlers' ``try``
    blocks. As a ``RuntimeError`` it reaches the generic 500 handler instead.
    """
