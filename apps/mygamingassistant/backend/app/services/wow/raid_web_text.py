"""A raid's description as text segments for its web page — pure, no I/O.

The description is what the leader wrote for the post (``notes``), Discord
tokens and all.  The page shows it the way Discord does, minus the markdown:

* ``<t:N>`` / ``<t:N:s>`` is a time, shown in the viewer's own zone in
  Discord's style *s* (``t T d D f F R``; ``f`` when there's none);
* ``<@id>`` / ``<@!id>`` becomes "@member", ``<@&id>`` "@role" and
  ``<#id>`` "#channel": the page never names a Discord account, role or
  channel by its id;
* ``<:name:id>`` / ``<a:name:id>`` (a custom emoji) becomes ":name:";
* everything else stays text, markdown included, shown as typed.

The page renders the segments as text nodes, never as HTML.
"""
from __future__ import annotations

import re
from typing import Final

from app.schemas.wow.raid_web import MentionSegment, Segment, TextSegment, TimeSegment

DEFAULT_TIME_STYLE: Final = "f"
# One alternative per kind of token; the named group that matched says which.
_TOKEN: Final = re.compile(
    r"<t:(?P<unix>\d{1,12})(?::(?P<style>[tTdDfFR]))?>"
    r"|<@!?(?P<member>\d{1,20})>"
    r"|<@&(?P<role>\d{1,20})>"
    r"|<#(?P<channel>\d{1,20})>"
    r"|<a?:(?P<emoji>[A-Za-z0-9_]{2,32}):\d{1,20}>"
)
_MENTIONS: Final = (("member", "@member"), ("role", "@role"), ("channel", "#channel"))


def description_segments(text: str | None) -> list[Segment]:
    """*text* as segments in order, neighbouring text merged; [] when there's none."""
    source = text or ""
    segments: list[Segment] = []
    position = 0
    for match in _TOKEN.finditer(source):
        _append_text(segments, source[position : match.start()])
        token = _token(match)
        if isinstance(token, str):
            _append_text(segments, token)
        else:
            segments.append(token)
        position = match.end()
    _append_text(segments, source[position:])
    return segments


def _token(match: re.Match[str]) -> MentionSegment | TimeSegment | str:
    """The token's segment; a custom emoji is only its name, as text."""
    if match["unix"] is not None:
        return TimeSegment(unix=int(match["unix"]), style=match["style"] or DEFAULT_TIME_STYLE)
    for group, label in _MENTIONS:
        if match[group] is not None:
            return MentionSegment(text=label)
    return f":{match['emoji']}:"


def _append_text(segments: list[Segment], text: str) -> None:
    """Add *text*, joined onto the last segment when that's text too."""
    if not text:
        return
    if segments and isinstance(segments[-1], TextSegment):
        segments[-1] = TextSegment(text=segments[-1].text + text)
        return
    segments.append(TextSegment(text=text))
