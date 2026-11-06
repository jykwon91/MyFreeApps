"""Parse ``WOW_FEATURE_TRIAGE_TOKEN`` — ``label:token,label:token``.

A bare token (no ``label:``) is labelled ``default``. Raises ``ValueError`` on
anything malformed or weak, which ``Settings`` turns into a boot failure. The
messages never include a token.
"""
import re

from app.core.triage_token import TriageToken
from app.core.wow_feature_request_limits import (
    TRIAGE_DEFAULT_LABEL,
    TRIAGE_LABEL_PATTERN,
    TRIAGE_TOKEN_MIN_DISTINCT_CHARS,
    TRIAGE_TOKEN_MIN_LENGTH,
)

_LABEL = re.compile(TRIAGE_LABEL_PATTERN)
_GENERATE_HINT = 'Generate one with `python -c "import secrets;print(secrets.token_urlsafe(32))"`.'


def parse_triage_tokens(raw: str) -> tuple[TriageToken, ...]:
    tokens: list[TriageToken] = []
    for entry in (part.strip() for part in raw.split(",")):
        if not entry:
            continue
        label, sep, token = entry.partition(":")
        if not sep:
            label, token = TRIAGE_DEFAULT_LABEL, entry
        label, token = label.strip(), token.strip()
        if not _LABEL.match(label):
            raise ValueError(
                f"WOW_FEATURE_TRIAGE_TOKEN: label {label!r} must match {TRIAGE_LABEL_PATTERN}."
            )
        if len(token) < TRIAGE_TOKEN_MIN_LENGTH or len(set(token)) < TRIAGE_TOKEN_MIN_DISTINCT_CHARS:
            raise ValueError(
                f"WOW_FEATURE_TRIAGE_TOKEN: the {label!r} token must be at least "
                f"{TRIAGE_TOKEN_MIN_LENGTH} characters with at least "
                f"{TRIAGE_TOKEN_MIN_DISTINCT_CHARS} different characters. {_GENERATE_HINT}"
            )
        if any(t.label == label for t in tokens):
            raise ValueError(f"WOW_FEATURE_TRIAGE_TOKEN: label {label!r} is used twice.")
        tokens.append(TriageToken(label=label, token=token))
    return tuple(tokens)
