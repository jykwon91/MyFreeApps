"""Read-only catalog: supported languages and conversation scenarios.

Backed by the in-code registries (``app/domain``) -- no database access.
"""
from __future__ import annotations

from app.domain.languages import get_language, list_languages
from app.domain.scenarios import list_scenarios
from app.schemas.tutor.catalog_schemas import LanguageResponse, ScenarioResponse
from app.services.tutor.tutor_mappers import to_language_response, to_scenario_response


class UnknownLanguageError(ValueError):
    """Raised when a language code is not in the registry."""


def get_languages() -> list[LanguageResponse]:
    return [to_language_response(lang) for lang in list_languages()]


def get_scenarios(language_code: str) -> list[ScenarioResponse]:
    """Scenarios available for ``language_code``, in learning-path order.

    Every scenario is available in every supported language today; the
    language is validated so a typo'd / unsupported code is a clear 422 rather
    than a silently-empty or silently-wrong list.
    """
    if get_language(language_code) is None:
        raise UnknownLanguageError(f"Unsupported language: {language_code}")
    return [to_scenario_response(s) for s in list_scenarios()]
