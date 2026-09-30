"""LanguageConfig -- one supported target language."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LanguageConfig:
    """A language the tutor can teach.

    Attributes:
        code: Stable short code stored on ``tutor_session.language_code``
            (e.g. ``"es"``). Never rename once shipped -- sessions reference it.
        display_name: Learner-facing name ("Spanish").
        dialect_label: Which variety the tutor speaks ("Latin American").
        stt_locale: BCP-47 locale for speech-to-text ("es-MX").
        tts_locale: BCP-47 locale for text-to-speech ("es-MX").
    """

    code: str
    display_name: str
    dialect_label: str
    stt_locale: str
    tts_locale: str
