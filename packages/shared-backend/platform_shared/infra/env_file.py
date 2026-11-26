"""Read an app's KEY=VALUE env files. Standard library only: ``seed_env``
imports this and runs on the VPS host's bare ``python3``. Also holds the
seeder's placeholder check, secret generators and secure writer."""
from __future__ import annotations

import base64
import os
import secrets
from pathlib import Path

# Placeholder prefixes in the example templates that count as "not set".
_PLACEHOLDER_PREFIXES: tuple[str, ...] = ("change-me", "__APP_SLUG__")


def is_unset(value: str) -> bool:
    v = value.strip()
    if not v:
        return True
    return any(v.startswith(p) or p in v for p in _PLACEHOLDER_PREFIXES)


def _gen_db_password() -> str:
    return secrets.token_hex(24)


def _gen_secret_key() -> str:
    return secrets.token_hex(32)


def _gen_encryption_key() -> str:
    # Fernet key format: urlsafe base64 of 32 random bytes. The shared PII
    # suite HKDF-derives from this string, so the format doubles as valid
    # direct Fernet key material.
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()


GENERATORS = {
    "DB_PASSWORD": _gen_db_password,
    "SECRET_KEY": _gen_secret_key,
    "ENCRYPTION_KEY": _gen_encryption_key,
}


def parse_env(text: str) -> dict[str, str]:
    """Parse KEY=VALUE lines into a dict. Comments/blank lines are skipped."""
    values: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        values[key.strip()] = value.strip()
    return values


def raw_env_values(text: str) -> dict[str, str]:
    """Like ``parse_env`` but keeps each value exactly as written after ``=``.
    The apps read their env files with ``format: raw``, so a pasted non-breaking
    space that ``str.strip()`` would remove still reaches them."""
    values: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value
    return values


def read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    return parse_env(path.read_text(encoding="utf-8"))


def write_secure(path: Path, text: str) -> bool:
    """Write only if content changed; chmod 600 either way. Returns True if written."""
    changed = True
    if path.exists():
        changed = path.read_text(encoding="utf-8") != text
    if changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
    os.chmod(path, 0o600)
    return changed
