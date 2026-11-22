"""A Discord API path with its ids and interaction token taken out, for logs.

``/webhooks/{application_id}/{interaction_token}/...`` carries the interaction
token, which lets anyone holding it post as the app for 15 minutes. Numeric ids
(channels, messages, guild members) are swapped out too, so log lines and
Sentry events group by endpoint and name no Discord user.
"""
from __future__ import annotations

ID_PLACEHOLDER = "{id}"
TOKEN_PLACEHOLDER = "{token}"
_WEBHOOKS_SEGMENT = "webhooks"


def route_template(path: str) -> str:
    """``"/webhooks/{id}/{token}/messages/@original"`` for a real webhook path."""
    segments = path.split("/")
    templated = []
    for index, segment in enumerate(segments):
        if index >= 2 and segments[index - 2] == _WEBHOOKS_SEGMENT:
            templated.append(TOKEN_PLACEHOLDER)
        elif segment.isdigit():
            templated.append(ID_PLACEHOLDER)
        else:
            templated.append(segment)
    return "/".join(templated)


__all__ = ["ID_PLACEHOLDER", "TOKEN_PLACEHOLDER", "route_template"]
