"""TOTP (RFC 6238) helpers — pure functions, no database, no app config.

Promoted from MyBookkeeper's ``app.services.user.totp_service`` (PR M5 of the
shared-backend migration). The MBK version mixed pure crypto/OTP helpers with
DB-coupled coordinators (``setup_totp``, ``confirm_totp``, ``disable_totp``,
``validate_totp_for_login``); the DB-coupled half stayed in MBK as a thin
orchestration layer. Only the pure helpers live here.

The caller is responsible for:
  * persisting the returned ``secret`` and ``recovery_codes`` (typically on
    a ``users`` row, transparently encrypted-at-rest via the M2
    :class:`platform_shared.core.encrypted_string_type.EncryptedString`
    TypeDecorator using the caller's own PII codec)
  * supplying the ``label`` (usually the user's email) and ``issuer`` (the
    app brand shown in Google Authenticator / 1Password) on enrollment

Wire format / on-disk format is preserved verbatim from the MBK production
copy so existing TOTP-enrolled users keep generating valid codes:
  * secrets are ``pyotp.random_base32()`` (default 32-char base32 alphabet)
  * recovery codes are ``secrets.token_hex(4).upper()`` (8 uppercase hex chars)
  * the otpauth URI is ``pyotp.TOTP(secret).provisioning_uri(name=label,
    issuer_name=issuer)`` — RFC 6238 + Google Authenticator key-uri spec
  * verification window is ±1 30-second step (``valid_window=1``)

Per-user Fernet derivation (``make_user_fernet``, ``encrypt_for_user``,
``decrypt_for_user``) is also pure: callers pass their own
``encryption_key`` master and ``user_id``; the function never reads global
config. MBK uses these to encrypt the TOTP secret + comma-separated recovery
codes onto the user row; we keep the helpers here so any future app can use
the same scheme without copy-paste.

Cross-app key isolation is automatic: the Fernet key is
``sha256(encryption_key || str(user_id))``, so two apps running with
different ``encryption_key`` masters cannot decrypt each other's stored
secrets, even for users sharing the same UUID.
"""
import base64
import hashlib
import secrets
import uuid
from typing import Final

import pyotp
from cryptography.fernet import Fernet

# Default to RFC 6238's 30-second step + ±1 step drift, matching what MBK
# shipped to production. Bumping ``VERIFY_WINDOW`` widens the window the
# user has to type the code; tightening it would invalidate codes typed
# with mild clock skew. Constant lives at module scope so callers (and
# tests) can reference the production value without magic numbers.
VERIFY_WINDOW: Final[int] = 1

# 8 alphanumeric (hex) recovery codes, 8 chars each. Format must NOT change
# without a data migration — production users have these stored on their
# user row; changing the format invalidates every existing code.
DEFAULT_RECOVERY_CODE_COUNT: Final[int] = 8
RECOVERY_CODE_BYTES: Final[int] = 4  # token_hex(4) -> 8 hex chars uppercased


# ---------------------------------------------------------------------------
# Pure crypto / OTP helpers
# ---------------------------------------------------------------------------

def generate_secret() -> str:
    """Return a fresh base32 TOTP secret (RFC 6238 / Google Authenticator compatible)."""
    return pyotp.random_base32()


def get_provisioning_uri(secret: str, label: str, *, issuer: str) -> str:
    """Build the ``otpauth://`` URI consumed by authenticator apps.

    ``label`` is typically the user's email; ``issuer`` is the app brand
    shown in Google Authenticator / 1Password. Both are caller-supplied so
    no app-specific config leaks into this module.
    """
    return pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name=issuer)


def verify_code(secret: str, code: str) -> bool:
    """Return True if ``code`` is the current TOTP for ``secret`` (±1 step)."""
    if not code:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=VERIFY_WINDOW)


def generate_recovery_codes(count: int = DEFAULT_RECOVERY_CODE_COUNT) -> list[str]:
    """Return ``count`` fresh recovery codes (8 uppercase hex chars each).

    Format matches MBK production exactly — must not change without
    migrating existing user rows.
    """
    return [secrets.token_hex(RECOVERY_CODE_BYTES).upper() for _ in range(count)]


def verify_recovery_code(
    stored_codes_str: str | None,
    candidate: str,
) -> tuple[bool, str | None]:
    """Consume a recovery code from a comma-separated stored string.

    Returns ``(valid, remaining_codes_str)``. If valid, ``remaining`` has the
    matched code removed. If the last code was consumed, ``remaining`` is
    ``None`` (so the caller can clear the column entirely). If invalid,
    ``remaining`` is the original ``stored_codes_str`` unchanged.

    Match is case-insensitive and tolerates leading/trailing whitespace —
    users typing recovery codes on a phone are forgiving cases worth
    handling.
    """
    if not stored_codes_str:
        return False, None
    codes = stored_codes_str.split(",")
    normalized = candidate.strip().upper()
    if normalized in codes:
        codes.remove(normalized)
        return True, ",".join(codes) if codes else None
    return False, stored_codes_str


def enroll_totp(
    *,
    label: str,
    issuer: str,
    recovery_code_count: int = DEFAULT_RECOVERY_CODE_COUNT,
) -> tuple[str, str, list[str]]:
    """Generate a fresh TOTP enrollment bundle.

    Returns ``(secret, provisioning_uri, recovery_codes)``. The caller is
    responsible for persisting all three values (typically on the user row,
    encrypted at rest via the M2 ``EncryptedString`` TypeDecorator).

    This is a thin convenience wrapper over :func:`generate_secret`,
    :func:`get_provisioning_uri`, and :func:`generate_recovery_codes` so
    apps don't have to call all three in sequence.
    """
    secret = generate_secret()
    uri = get_provisioning_uri(secret, label, issuer=issuer)
    recovery_codes = generate_recovery_codes(count=recovery_code_count)
    return secret, uri, recovery_codes


# ---------------------------------------------------------------------------
# Per-user Fernet helpers (pure — caller supplies the master key)
# ---------------------------------------------------------------------------

def make_user_fernet(encryption_key: str, user_id: uuid.UUID) -> Fernet:
    """Build a per-user :class:`Fernet` cipher.

    The derivation is intentionally simple — ``sha256(master || user_id)``
    — because it has been in production at MBK since the original 2FA
    rollout and changing it would require re-encrypting every existing
    ``users.totp_secret`` value. If a future app needs HKDF or a stronger
    KDF, define a sibling helper rather than mutating this one.
    """
    key = hashlib.sha256(
        encryption_key.encode() + str(user_id).encode(),
    ).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_for_user(value: str, encryption_key: str, user_id: uuid.UUID) -> str:
    """Encrypt ``value`` under the per-user Fernet key. Returns urlsafe-base64 token."""
    return make_user_fernet(encryption_key, user_id).encrypt(value.encode()).decode()


def decrypt_for_user(value: str, encryption_key: str, user_id: uuid.UUID) -> str:
    """Decrypt a token previously produced by :func:`encrypt_for_user`.

    Raises :class:`cryptography.fernet.InvalidToken` if the key/user pair
    doesn't match the one that produced ``value``.
    """
    return make_user_fernet(encryption_key, user_id).decrypt(value.encode()).decode()
