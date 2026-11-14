"""`.env.example` is what operators copy into `.env.docker`, so its upload ceiling
must match the backend default. A smaller value there quietly refuses documents the
apps tell the user they can send (they hold one file to 29 MB)."""
from pathlib import Path

from app.core.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parents[1] / ".env.example"
KEY = "MAX_UPLOAD_SIZE_BYTES"


def _example_value() -> int:
    for line in ENV_EXAMPLE.read_text().splitlines():
        if line.startswith(f"{KEY}="):
            return int(line.split("=", 1)[1])
    raise AssertionError(f"{KEY} missing from .env.example")


def test_env_example_upload_ceiling_matches_the_backend_default() -> None:
    assert _example_value() == Settings.model_fields["max_upload_size_bytes"].default
