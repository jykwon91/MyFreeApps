"""Evaluate the client's spell tooltip templates into plain text.

The Forever client describes every food with a template such as
``$@spelldesc1129 If you spend at least 10 seconds eating you will become
well fed and gain $s2 Stamina for $1248406d.`` Reading the client's own
wording keeps the picker honest: the amount, the stat and any condition
("while in Westfall") come out exactly as the game shows them.

Supported tokens (all we meet in food and drink tooltips):

* ``$@spelldesc<id>`` / ``$@spellname<id>`` / ``$@spellicon<id>``
* ``$s<n>`` ``$w<n>`` ``$m<n>`` ``$M<n>`` — effect ``n`` base points, of this
  spell or of ``$<id>s<n>``
* ``$o<n>`` — the effect's total over the duration (a tick every 5 s)
* ``$t<n>`` — the effect's tick period, in seconds
* ``$d`` / ``$<id>d`` (also written ``$<id>d1``) — duration
* ``$/<div>;<token>`` — a value divided
* ``$?<cond>[yes][no]`` — conditionals are dropped (the picker reports the
  one we care about, the Well Fed XP boost, separately)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

TICK_MS = 5000

_CONDITIONAL = re.compile(r"\$\?!?[a-z]+\d+\[[^\[\]]*\]\[[^\[\]]*\]", re.IGNORECASE)
_SPELL_REF = re.compile(r"\$@spell(desc|name|icon)(\d+)")
_DIVIDED = re.compile(r"\$/(\d+);(\d*)([swmMo])(\d)")
_VALUE = re.compile(r"\$(\d*)([swmMo])(\d)")
_PERIOD = re.compile(r"\$(\d*)t(\d)")
_DURATION = re.compile(r"\$(\d*)d\d?(?![a-z])")


@dataclass(frozen=True)
class Effect:
    index: int
    effect: int
    aura: int
    base_points: float
    misc: int
    period_ms: int
    trigger: int
    item_type: int = 0


@dataclass
class SpellBook:
    """The spell tables a tooltip needs, keyed by spell id."""

    names: dict[int, str] = field(default_factory=dict)
    descriptions: dict[int, str] = field(default_factory=dict)
    aura_descriptions: dict[int, str] = field(default_factory=dict)
    durations_ms: dict[int, int] = field(default_factory=dict)
    effects: dict[int, list[Effect]] = field(default_factory=dict)

    def effect(self, spell_id: int, number: int) -> Effect | None:
        """Effect ``number`` (1-based, as tooltips count) of a spell.

        A few client tooltips name an effect the spell doesn't have (Goldthorn
        Tea's ``$1249907s2`` on a one-effect spell); the only effect is meant.
        """
        effects = self.effects.get(spell_id, [])
        for e in effects:
            if e.index == number - 1:
                return e
        return effects[0] if len(effects) == 1 else None


def format_duration(ms: int) -> str:
    seconds = ms // 1000
    if seconds >= 3600 and seconds % 3600 == 0:
        return f"{seconds // 3600} hr"
    if seconds >= 60 and seconds % 60 == 0:
        return f"{seconds // 60} min"
    return f"{seconds} sec"


def _number(value: float) -> str:
    return str(int(round(value))) if abs(value - round(value)) < 1e-6 else f"{value:.1f}"


def _value(book: SpellBook, spell_id: int, kind: str, number: int) -> float | None:
    e = book.effect(spell_id, number)
    if e is None:
        return None
    if kind == "o":
        ticks = book.durations_ms.get(spell_id, 0) / (e.period_ms or TICK_MS)
        return abs(e.base_points) * ticks
    return abs(e.base_points)


def evaluate(book: SpellBook, spell_id: int, template: str | None = None, depth: int = 0) -> str:
    """The tooltip of ``spell_id`` (or ``template`` read in its context) as plain text."""
    text = book.descriptions.get(spell_id, "") if template is None else template
    if depth > 4:
        return ""
    text = _CONDITIONAL.sub("", text)

    def spell_ref(m: re.Match[str]) -> str:
        ref = int(m.group(2))
        if m.group(1) == "desc":
            return evaluate(book, ref, depth=depth + 1)
        if m.group(1) == "name":
            return book.names.get(ref, "")
        return ""

    def divided(m: re.Match[str]) -> str:
        ref = int(m.group(2)) if m.group(2) else spell_id
        v = _value(book, ref, m.group(3).lower() if m.group(3) != "o" else "o", int(m.group(4)))
        return m.group(0) if v is None else _number(v / int(m.group(1)))

    def value(m: re.Match[str]) -> str:
        ref = int(m.group(1)) if m.group(1) else spell_id
        kind = "o" if m.group(2) == "o" else "s"
        v = _value(book, ref, kind, int(m.group(3)))
        return m.group(0) if v is None else _number(v)

    def period(m: re.Match[str]) -> str:
        ref = int(m.group(1)) if m.group(1) else spell_id
        e = book.effect(ref, int(m.group(2)))
        return m.group(0) if e is None or not e.period_ms else _number(e.period_ms / 1000)

    def duration(m: re.Match[str]) -> str:
        ref = int(m.group(1)) if m.group(1) else spell_id
        ms = book.durations_ms.get(ref)
        return m.group(0) if not ms else format_duration(ms)

    text = _SPELL_REF.sub(spell_ref, text)
    text = _DIVIDED.sub(divided, text)
    text = _VALUE.sub(value, text)
    text = _PERIOD.sub(period, text)
    text = _DURATION.sub(duration, text)
    return re.sub(r"\s+", " ", text).strip()
