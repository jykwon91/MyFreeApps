"""Registry of supported languages.

Adding a language is a code change PLUS an Alembic migration that widens the
``ck_tutor_session_language_code`` CHECK constraint --
``tests/test_domain_registries.py`` fails until both agree.
"""
from __future__ import annotations

from app.domain.languages.language_config import LanguageConfig

SPANISH = LanguageConfig(
    code="es",
    display_name="Spanish",
    dialect_label="Latin American",
    stt_locale="es-MX",
    tts_locale="es-MX",
)

# Insertion order is the display order.
LANGUAGES: dict[str, LanguageConfig] = {
    SPANISH.code: SPANISH,
}

LANGUAGE_CODES: tuple[str, ...] = tuple(LANGUAGES)


def get_language(code: str) -> LanguageConfig | None:
    """Return the language for ``code``, or None when unsupported."""
    return LANGUAGES.get(code)


def list_languages() -> list[LanguageConfig]:
    return list(LANGUAGES.values())
