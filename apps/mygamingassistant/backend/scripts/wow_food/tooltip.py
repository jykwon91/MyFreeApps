"""Evaluate the client's spell tooltip templates into plain text.

The Forever client describes every food with a template such as
``$@spelldesc1129 If you spend at least 10 seconds eating you will become
well fed and gain $s2 Stamina for $1248406d.`` Reading the client's own
wording keeps the picker honest: the amount, the stat and any condition
("while in Westfall") come out exactly as the game shows them. The talent
calculator reads its rank descriptions the same way.

Supported tokens:

* ``$@spelldesc<id>`` / ``$@spellname<id>`` / ``$@spellicon<id>``
* ``$s<n>`` ``$S<n>`` ``$w<n>`` ``$m<n>`` ``$M<n>`` — effect ``n`` base points, of this
  spell or of ``$<id>s<n>``; an effect that rolls (``Variance``, the Forever
  client's form of Classic's dice) reads "26 to 34", as the game shows it.
  Shown without a sign, as the game does ("reduces the cast time by 0.5 sec").
* ``$o<n>`` — the effect's total over the duration (a tick every 5 s)
* ``$t<n>`` — the effect's tick period, in seconds
* ``$a<n>`` — the effect's radius, in yards; ``$x<n>`` — its chain targets
* ``$h`` / ``$n`` / ``$u`` (also ``$<id>h`` ...) — proc chance, proc charges, most stacks
* ``$d`` / ``$<id>d`` (also written ``$<id>d1``) — duration
* ``$/<div>;<token>`` — a value divided
* ``${<expression>}`` / ``${...}.<decimals>`` — arithmetic over the tokens above,
  which keep their sign there (``${$m1/-1000}`` of -200 is 0.2)
* ``$l<singular>:<plural>;`` — the word for the number before it
* ``$?<cond>[yes][no]`` — the condition is about the player's own spells and
  auras, which a page can't know: dropped by default (the food picker reports
  the one it cares about, the Well Fed XP boost, separately), or the ``no``
  branch with ``conditional_else=True`` — what a player without that spell sees

A token the evaluator can't fill is left in the text as it is, so a caller can
spot it (``unresolved_tokens``).
"""
from __future__ import annotations

import ast
import math
import operator
import re
from collections.abc import Callable
from dataclasses import dataclass, field

TICK_MS = 5000

_CONDITIONAL = re.compile(r"\$\?!?[a-z]+\d+\[([^\[\]]*)\]\[([^\[\]]*)\]", re.IGNORECASE)
_SPELL_REF = re.compile(r"\$@spell(desc|name|icon)(\d+)")
_EXPRESSION = re.compile(r"\$\{([^{}]*)\}(?:\.(\d))?")
_DIVIDED = re.compile(r"\$/(\d+);(\d*)([swmMoS])(\d)")
_VALUE = re.compile(r"\$(\d*)([swmMoS])(\d)")
_PERIOD = re.compile(r"\$(\d*)t(\d)")
_RADIUS = re.compile(r"\$(\d*)([ax])(\d)")
_AURA_OPTION = re.compile(r"\$(\d*)([hnu])(?![a-zA-Z])")
_DURATION = re.compile(r"\$(\d*)d\d?(?![a-z])")
_PLURAL = re.compile(r"\$[lL]([^:;$]*):([^;$]*);")
_NUMBER_BEFORE = re.compile(r"(\d+(?:\.\d+)?)\D*$")
# What's left of an expression once its tokens are numbers.
_ARITHMETIC = re.compile(r"^[\d\s.+\-*/()]+$")
_UNRESOLVED = re.compile(r"\$\{[^{}]*\}|\$[^\s.,;:)]*")
_OPERATORS: dict[type, Callable[..., float]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


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
    # Spread of the roll around the base: base × (1 ± variance / 2).
    variance: float = 0.0
    radius_yards: float = 0.0
    chain_targets: int = 0


@dataclass(frozen=True)
class AuraOptions:
    """A spell's proc chance (%), proc charges and most stacks (``$h`` / ``$n`` / ``$u``)."""

    proc_chance: int = 0
    proc_charges: int = 0
    stacks: int = 0


@dataclass
class SpellBook:
    """The spell tables a tooltip needs, keyed by spell id."""

    names: dict[int, str] = field(default_factory=dict)
    descriptions: dict[int, str] = field(default_factory=dict)
    aura_descriptions: dict[int, str] = field(default_factory=dict)
    durations_ms: dict[int, int] = field(default_factory=dict)
    effects: dict[int, list[Effect]] = field(default_factory=dict)
    aura_options: dict[int, AuraOptions] = field(default_factory=dict)

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


def _decimals(value: float, places: int) -> str:
    """``value`` to at most ``places`` decimals, trailing zeros dropped (0.20 -> "0.2")."""
    text = f"{value:.{places}f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def _half_up(value: float) -> int:
    return int(math.floor(value + 0.5))


def roll_range(e: Effect) -> str:
    """An effect's amount as the game prints it: "30", or "26 to 34" when it rolls."""
    base = abs(e.base_points)
    if not e.variance:
        return _number(base)
    return f"{_half_up(base * (1 - e.variance / 2))} to {_half_up(base * (1 + e.variance / 2))}"


def _signed_value(book: SpellBook, spell_id: int, kind: str, number: int) -> float | None:
    e = book.effect(spell_id, number)
    if e is None:
        return None
    if kind == "o":
        ticks = book.durations_ms.get(spell_id, 0) / (e.period_ms or TICK_MS)
        return e.base_points * ticks
    return e.base_points


def _value(book: SpellBook, spell_id: int, kind: str, number: int) -> float | None:
    v = _signed_value(book, spell_id, kind, number)
    return None if v is None else abs(v)


def _arithmetic(text: str) -> float | None:
    """``text`` (numbers, + - * / and brackets only) worked out; None when it isn't that."""
    if not _ARITHMETIC.match(text):
        return None

    def walk(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return walk(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.BinOp) and type(node.op) in _OPERATORS:
            return _OPERATORS[type(node.op)](walk(node.left), walk(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _OPERATORS:
            return _OPERATORS[type(node.op)](walk(node.operand))
        raise ValueError(f"not arithmetic: {ast.dump(node)}")

    try:
        return walk(ast.parse(text, mode="eval"))
    except (SyntaxError, ValueError, ZeroDivisionError):
        return None


def _plural(text: str) -> str:
    """Each ``$lsingular:plural;`` as the word for the last number before it."""
    out: list[str] = []
    last = 0
    for m in _PLURAL.finditer(text):
        before = "".join(out) + text[last : m.start()]
        number = _NUMBER_BEFORE.search(before)
        word = m.group(1) if number and float(number.group(1)) == 1 else m.group(2)
        out.append(text[last : m.start()] + word)
        last = m.end()
    out.append(text[last:])
    return "".join(out)


def unresolved_tokens(text: str) -> list[str]:
    """The tokens ``evaluate`` left in its text — ones it has no data or rule for."""
    return _UNRESOLVED.findall(text)


def evaluate(
    book: SpellBook,
    spell_id: int,
    template: str | None = None,
    depth: int = 0,
    *,
    conditional_else: bool = False,
) -> str:
    """The tooltip of ``spell_id`` (or ``template`` read in its context) as plain text."""
    text = book.descriptions.get(spell_id, "") if template is None else template
    if depth > 4:
        return ""
    text = _CONDITIONAL.sub(lambda m: m.group(2) if conditional_else else "", text)

    def ref_of(group: str) -> int:
        return int(group) if group else spell_id

    def spell_ref(m: re.Match[str]) -> str:
        ref = int(m.group(2))
        if m.group(1) == "desc":
            return evaluate(book, ref, depth=depth + 1, conditional_else=conditional_else)
        if m.group(1) == "name":
            return book.names.get(ref, "")
        return ""

    def duration_seconds(ref: int) -> float | None:
        ms = book.durations_ms.get(ref)
        return ms / 1000 if ms else None

    def expression(m: re.Match[str]) -> str:
        inner = m.group(1)
        inner = _VALUE.sub(
            lambda v: _text_or(_signed_value(book, ref_of(v.group(1)), _kind(v.group(2)), int(v.group(3))), v.group(0)),
            inner,
        )
        inner = _DURATION.sub(lambda d: _text_or(duration_seconds(ref_of(d.group(1))), d.group(0)), inner)
        result = _arithmetic(inner)
        if result is None:
            return m.group(0)
        return _decimals(result, int(m.group(2))) if m.group(2) else _number(result)

    def divided(m: re.Match[str]) -> str:
        v = _value(book, ref_of(m.group(2)), _kind(m.group(3)), int(m.group(4)))
        return m.group(0) if v is None else _number(v / int(m.group(1)))

    def value(m: re.Match[str]) -> str:
        ref = ref_of(m.group(1))
        kind = _kind(m.group(2))
        e = book.effect(ref, int(m.group(3)))
        if kind == "s" and e is not None and e.variance:
            return roll_range(e)
        v = _value(book, ref, kind, int(m.group(3)))
        return m.group(0) if v is None else _number(v)

    def period(m: re.Match[str]) -> str:
        e = book.effect(ref_of(m.group(1)), int(m.group(2)))
        return m.group(0) if e is None or not e.period_ms else _number(e.period_ms / 1000)

    def radius(m: re.Match[str]) -> str:
        e = book.effect(ref_of(m.group(1)), int(m.group(3)))
        amount = None if e is None else (e.radius_yards if m.group(2) == "a" else e.chain_targets)
        return m.group(0) if not amount else _number(amount)

    def aura_option(m: re.Match[str]) -> str:
        options = book.aura_options.get(ref_of(m.group(1)))
        if options is None:
            return m.group(0)
        amount = {"h": options.proc_chance, "n": options.proc_charges, "u": options.stacks}[m.group(2)]
        return m.group(0) if not amount else str(amount)

    def duration(m: re.Match[str]) -> str:
        ms = book.durations_ms.get(ref_of(m.group(1)))
        return m.group(0) if not ms else format_duration(ms)

    text = _SPELL_REF.sub(spell_ref, text)
    text = _EXPRESSION.sub(expression, text)
    text = _DIVIDED.sub(divided, text)
    text = _VALUE.sub(value, text)
    text = _PERIOD.sub(period, text)
    text = _RADIUS.sub(radius, text)
    text = _AURA_OPTION.sub(aura_option, text)
    text = _DURATION.sub(duration, text)
    text = _plural(text)
    return re.sub(r"\s+", " ", text).strip()


def _kind(letter: str) -> str:
    """``$o`` is a total over time; every other value letter reads the base points."""
    return "o" if letter == "o" else "s"


def _text_or(value: float | None, fallback: str) -> str:
    return fallback if value is None else repr(value)
