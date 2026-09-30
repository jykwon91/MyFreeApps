"""Registry of supported languages.

Adding a language is a code change PLUS an Alembic migration that widens the
``ck_tutor_session_language_code`` CHECK constraint --
``tests/test_domain_registries.py`` fails until both agree.
"""
from __future__ import annotations

from app.domain.languages.language_config import LanguageConfig
from app.domain.languages.prompt_pack import LanguagePromptPack
from app.domain.languages.spanish_prompts import SPANISH_PROMPTS

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

# Target-language prompt material, one pack per supported language.
PROMPT_PACKS: dict[str, LanguagePromptPack] = {
    SPANISH_PROMPTS.code: SPANISH_PROMPTS,
}


def get_language(code: str) -> LanguageConfig | None:
    """Return the language for ``code``, or None when unsupported."""
    return LANGUAGES.get(code)


def list_languages() -> list[LanguageConfig]:
    return list(LANGUAGES.values())


def get_prompt_pack(code: str) -> LanguagePromptPack | None:
    """The tutor's prompt material for ``code``, or None when unsupported."""
    return PROMPT_PACKS.get(code)
