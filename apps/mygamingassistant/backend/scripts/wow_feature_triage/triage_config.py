"""Read the triage base URL and token from ``backend/.env.triage`` (gitignored).

The token never comes from the command line or chat, and it is never printed.
Plain ``http://`` is only allowed for a local server, so the token can't cross
the network unencrypted.
"""
from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

from scripts.wow_feature_triage.triage_connection import TriageConfig

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = BACKEND_DIR / ".env.triage"
BASE_URL_KEY = "MGA_TRIAGE_BASE_URL"
TOKEN_KEY = "MGA_TRIAGE_TOKEN"
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def parse_env_file(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_config(path: Path = DEFAULT_ENV_FILE) -> TriageConfig:
    if not path.is_file():
        raise SystemExit(
            f"{path} not found. Copy .env.triage.example to .env.triage and fill in "
            f"{BASE_URL_KEY} and {TOKEN_KEY} (see docs/wow-forever-feature-triage.md)."
        )
    values = parse_env_file(path.read_text(encoding="utf-8"))
    base_url = values.get(BASE_URL_KEY, "").rstrip("/")
    token = values.get(TOKEN_KEY, "")
    if not base_url or not token:
        raise SystemExit(f"{path} must set both {BASE_URL_KEY} and {TOKEN_KEY}.")
    parsed = urlparse(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise SystemExit(f"{BASE_URL_KEY} must be a full URL like https://mygamingassistant.myfreeapps.org/api")
    if parsed.scheme == "http" and parsed.hostname not in LOCAL_HOSTS:
        raise SystemExit(f"{BASE_URL_KEY} must use https:// for anything but a local server.")
    return TriageConfig(base_url=base_url, token=token)
