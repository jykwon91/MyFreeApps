"""SQLAlchemy ``TypeDecorator`` that transparently encrypts/decrypts string PII.

This is the shared, app-agnostic implementation. Each app constructs its own
codec with its own ``secret_key`` / ``salt`` / ``info`` constants and then
either:

1. Uses ``EncryptedString(length, codec=my_codec)`` directly at column-decl
   sites, or
2. Subclasses :class:`EncryptedString` to bake the codec in once::

       class MyAppEncryptedString(EncryptedString):
           _codec = my_app_codec

   …and then declares columns with ``MyAppEncryptedString(length)`` so the
   call sites stay byte-identical.

Why a codec instead of importing ``encrypt_pii`` directly:
    The shared package has no knowledge of app-specific settings (e.g.
    ``app.core.config``), so the encryption key + HKDF salt + HKDF info must
    be injected. Threading them through every column declaration is noisy —
    a single :class:`PIICodec` value captures the trio.

Tampered ciphertext raises ``cryptography.fernet.InvalidToken`` from the
underlying Fernet library — surfaced as a clear ``ValueError`` here so callers
don't have to import ``cryptography`` to catch it.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from cryptography.fernet import InvalidToken
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator


@dataclass(frozen=True)
class PIICodec:
    """An encrypt/decrypt callable pair for a specific PII key family.

    Both callables accept and return ``str | None`` and treat ``None`` as
    a passthrough — matching the shape of
    :func:`platform_shared.core.security.encrypt_pii` /
    :func:`platform_shared.core.security.decrypt_pii`.
    """

    encrypt: Callable[[str | None], str | None]
    decrypt: Callable[[str | None], str | None]


class EncryptedString(TypeDecorator):
    """A ``String(N)`` column that encrypts on write and decrypts on read.

    The ``length`` parameter is the **plaintext** size budget — the underlying
    database column is sized as unbounded ``String`` so the much-larger Fernet
    ciphertext (plaintext + ~80 bytes of header + base64 overhead) always fits.

    Args:
        length: Documentary plaintext-size budget. Not enforced at the DB
            level — bounding the column would risk truncating valid ciphertext.
        codec: An :class:`PIICodec` providing encrypt/decrypt callables. May
            be omitted if a subclass sets ``_codec`` as a class attribute
            (the per-app convenience pattern).

    A subclass-only declaration (no codec arg at instantiation) requires
    ``_codec`` to be set on the subclass; otherwise instantiation raises
    :class:`TypeError`.
    """

    impl = String
    cache_ok = True

    # Per-app subclasses set this to a PIICodec; instances may also override
    # via the constructor.
    _codec: PIICodec | None = None

    def __init__(
        self,
        length: int | None = None,
        *args: object,
        codec: PIICodec | None = None,
        **kwargs: object,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._plaintext_length = length
        if codec is not None:
            # Bind to the instance, shadowing the class attribute.
            self._codec = codec
        if self._codec is None:
            raise TypeError(
                "EncryptedString requires a `codec=` argument or a subclass "
                "with a `_codec` class attribute set to a PIICodec instance.",
            )

    @property
    def python_type(self) -> type[str]:
        return str

    def process_bind_param(self, value: object, dialect: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise TypeError(
                f"EncryptedString expected str, got {type(value).__name__}",
            )
        assert self._codec is not None  # guaranteed by __init__
        return self._codec.encrypt(value)

    def process_result_value(self, value: object, dialect: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise TypeError(
                f"EncryptedString expected stored str, got {type(value).__name__}",
            )
        assert self._codec is not None
        try:
            return self._codec.decrypt(value)
        except InvalidToken as exc:
            raise ValueError(
                "Failed to decrypt EncryptedString column — ciphertext is "
                "corrupted, was encrypted with a different key, or was tampered with.",
            ) from exc
