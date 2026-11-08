"""Evaluate the client's spell tooltip templates into plain text.

The Forever client describes every food with a template such as
``$@spelldesc1129 If you spend at least 10 seconds eating you will become
well fed and gain $s2 Stamina for $1248406d.`` Reading the client's own
wording keeps the picker honest: the amount, the stat and any condition
("while in Westfall") come out exactly as the game shows them. The talent
calculator and the spellbook read their rank descriptions the same way.

Supported tokens (each may name another spell first, ``$<id>s1``):

* ``$@spelldesc<id>`` / ``$@spelltooltip<id>`` / ``$@spellname<id>`` / ``$@spellicon<id>``
* ``$s<n>`` ``$S<n>`` ``$w<n>`` — effect ``n`` base points; an effect that rolls
  (``Variance``, the Forever client's form of Classic's dice) reads "26 to 34",
  as the game shows it. Shown without a sign, as the game does ("reduces the
  cast time by 0.5 sec").
* ``$m<n>`` / ``$M<n>`` — the low / high end of that roll (the base when it doesn't roll)
* ``$o<n>`` — the effect's total over the duration (a tick every 5 s)
* ``$t<n>`` — the effect's tick period, in seconds; bare ``$t``, the first periodic effect's
* ``$a<n>`` — the effect's radius, in yards (bare ``$a``, the first effect with one);
  ``$x<n>`` — its chain targets
* ``$b<n>`` — points per combo point (``EffectPointsPerResource``); ``$e<n>`` — the
  effect's multiple (``EffectAmplitude``, Mana Shield's mana per damage);
  ``$f<n>`` — its chain amplitude (Execute's damage per rage); ``$q<n>`` — its misc
  value (the mana a resurrection gives back). Bare, these read effect 1.
* ``$i`` — most targets; ``$v`` — highest target level; ``$r`` — range, in yards
* ``$h`` / ``$n`` / ``$u`` — proc chance, proc charges, most stacks
* ``$d`` (also written ``$<id>d1``) — duration
* ``$/<n>;<token>`` / ``$*<n>;<token>`` — a value divided / multiplied
* ``$<name>`` — the spell's description variable (``SpellDescriptionVariables``),
  worked out like an expression
* ``${<expression>}`` / ``${...}.<decimals>`` — arithmetic over the tokens above,
  which keep their sign there (``${$m1/-1000}.1`` of -200 is 0.2); a whole number
  unless decimals are asked for
* ``$l<singular>:<plural>;`` — the word for the number before it
* ``$g<male>:<female>;`` — both words ("he or she"); the page doesn't know the player
* ``$?<cond>[yes][no]`` (``<cond>`` may join several with ``|`` / ``&``) — the
  condition is about the player's own spells and auras, which a page can't know:
  dropped by default (the food picker reports the one it cares about, the Well Fed
  XP boost, separately), or the ``no`` branch with ``conditional_else=True`` —
  what a player without that spell sees. Description variables always take the
  ``no`` branch: their value for a player without the talents they check.

Stats of the player reading the tooltip (``$SPI``, ``$AP``, ``$rap``, ``$PL`` ...)
and their home (``$z``) are what the game fills from the character, so they
can't be worked out here. A token the evaluator can't fill is left in the text
as it is, so a caller can spot it (``unresolved_tokens``) and leave that
sentence out.
"""
from __future__ import annotations

import ast
import math
import operator
import re
from collections.abc import Callable
from dataclasses import dataclass, field

TICK_MS = 5000
MAX_DEPTH = 4
MAX_VARIABLE_DEPTH = 8

_COND_TERM = r"!?\$?[a-zA-Z]+\d+"
_CONDITIONAL = re.compile(rf"\$\?{_COND_TERM}(?:[|&]{_COND_TERM})*\[([^\[\]]*)\]\[([^\[\]]*)\]")
_SPELL_REF = re.compile(r"\$@spell(desc|tooltip|name|icon)(\d+)")
_EXPRESSION = re.compile(r"\$\{([^{}]*)\}(?:\.(\d))?")
_VARIABLE = re.compile(r"\$<(\w+)>")
# A stray "$*" inside an expression (Frostbolt's "$m2$*$<frostdamage>") is a multiplication.
_STRAY_TIMES = re.compile(r"\$\*(?!\d)")
_TOKEN_LETTERS = "smMwWSoObBeEfFqQxXaAtThHnNuUiIvVrRdD"
_SCALED = re.compile(rf"\$([/*])(\d+);(\d*)([{_TOKEN_LETTERS}])(\d?)(?![a-zA-Z\d])")
_TOKEN = re.compile(rf"\$(\d*)([{_TOKEN_LETTERS}])(\d?)(?![a-zA-Z\d])")
_GENDER = re.compile(r"\$[gG]([^:;$]*):([^;$]*);")
_PLURAL = re.compile(r"\$[lL]([^:;$]*):([^;$]*);")
_NUMBER_BEFORE = re.compile(r"(\d+(?:\.\d+)?)\D*$")
_VARIABLE_LINE = re.compile(r"^\s*\$(\w+)\s*=(.*)$")
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
# Tokens whose 0 means "the spell has none" rather than an amount of 0.
_ZERO_IS_MISSING = set("xXaAtTbBeEfFqQhHnNuUiIvVrRdD")
# Stands in for a referenced spell's finished text until the outer passes are done.
_SHIELD = re.compile("\ue000([\ue100-\uf8ff])\ue000")


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
    points_per_resource: float = 0.0
    amplitude: float = 0.0
    chain_amplitude: float = 0.0


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
    # A spell's description variables, name -> its expression (``$mult=...``).
    variables: dict[int, dict[str, str]] = field(default_factory=dict)
    max_targets: dict[int, int] = field(default_factory=dict)
    max_target_levels: dict[int, int] = field(default_factory=dict)
    ranges_yards: dict[int, float] = field(default_factory=dict)

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


def parse_variables(text: str) -> dict[str, str]:
    """``SpellDescriptionVariables.Variables`` — one ``$name=expression`` a line — as a dict."""
    out: dict[str, str] = {}
    for line in text.splitlines():
        if m := _VARIABLE_LINE.match(line):
            out[m.group(1)] = m.group(2).strip()
    return out


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


def _whole(value: float) -> str:
    """An expression's result as the game prints it with no decimals asked for."""
    return str(int(math.copysign(_half_up(abs(value)), value)))


def roll_range(e: Effect) -> str:
    """An effect's amount as the game prints it: "30", or "26 to 34" when it rolls."""
    if not e.variance:
        return _number(abs(e.base_points))
    return f"{abs(_roll_end(e, low=True)):.0f} to {abs(_roll_end(e, low=False)):.0f}"


def _roll_end(e: Effect, *, low: bool) -> float:
    """The low or high end of an effect's roll, signed like its base."""
    if not e.variance:
        return e.base_points
    spread = -e.variance / 2 if low else e.variance / 2
    return math.copysign(_half_up(abs(e.base_points) * (1 + spread)), e.base_points)


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


def _effect_for(book: SpellBook, spell_id: int, letter: str, number: str) -> Effect | None:
    if number:
        return book.effect(spell_id, int(number))
    effects = book.effects.get(spell_id, [])
    if letter in "tT":
        return next((e for e in effects if e.period_ms), None)
    if letter in "aA":
        return next((e for e in effects if e.radius_yards), None)
    return book.effect(spell_id, 1)


def _signed(book: SpellBook, spell_id: int, letter: str, number: str) -> float | None:
    """A token's value with its sign; None when the spell has nothing for it."""
    lower = letter.lower()
    value: float | None
    if lower in "hnu":
        options = book.aura_options.get(spell_id)
        value = None if options is None else {"h": options.proc_chance, "n": options.proc_charges, "u": options.stacks}[lower]
    elif lower == "d":
        ms = book.durations_ms.get(spell_id)
        # A negative duration means "until cancelled"; the client's wording for that isn't in the files.
        value = ms / 1000 if ms and ms > 0 else None
    elif lower == "i":
        value = book.max_targets.get(spell_id)
    elif lower == "v":
        value = book.max_target_levels.get(spell_id)
    elif lower == "r":
        value = book.ranges_yards.get(spell_id)
    else:
        e = _effect_for(book, spell_id, letter, number)
        if e is None:
            return None
        if letter in "mM":
            value = _roll_end(e, low=letter == "m")
        elif lower == "o":
            # A total over a duration the spell doesn't have (or that runs until cancelled) has no number.
            ms = book.durations_ms.get(spell_id, 0)
            value = e.base_points * ms / (e.period_ms or TICK_MS) if ms > 0 else None
        else:
            value = {
                "s": e.base_points,
                "w": e.base_points,
                "b": e.points_per_resource,
                "e": e.amplitude,
                "f": e.chain_amplitude,
                "q": float(e.misc),
                "x": float(e.chain_targets),
                "a": e.radius_yards,
                "t": e.period_ms / 1000,
            }.get(lower)
    if value is None or (not value and letter in _ZERO_IS_MISSING):
        return None
    return float(value)


def unresolved_tokens(text: str) -> list[str]:
    """The tokens ``evaluate`` left in its text — ones it has no data or rule for."""
    return _UNRESOLVED.findall(text)


def _resolve_conditionals(text: str, conditional_else: bool) -> str:
    """Every ``$?cond[yes][no]``, innermost first, as its ``no`` branch or nothing."""
    while True:
        out = _CONDITIONAL.sub(lambda m: m.group(2) if conditional_else else "", text)
        if out == text:
            return out
        text = out


class _Evaluator:
    """One spell's tooltip worked out: the tokens of ``spell_id`` unless a token names another spell."""

    def __init__(self, book: SpellBook, spell_id: int, depth: int, conditional_else: bool) -> None:
        self.book = book
        self.spell_id = spell_id
        self.depth = depth
        self.conditional_else = conditional_else
        self.shielded: list[str] = []

    def ref(self, group: str) -> int:
        return int(group) if group else self.spell_id

    def variable(self, name: str, seen: frozenset[str] = frozenset()) -> float | None:
        expression = self.book.variables.get(self.spell_id, {}).get(name)
        if expression is None or name in seen or len(seen) >= MAX_VARIABLE_DEPTH:
            return None
        expression = _resolve_conditionals(expression, conditional_else=True).strip()
        whole = _EXPRESSION.fullmatch(expression)
        return self.compute(whole.group(1) if whole else expression, seen | {name})

    def variable_places(self, name: str) -> int | None:
        """The decimals a variable's ``${...}.N`` asks for; None for a whole number."""
        expression = self.book.variables.get(self.spell_id, {}).get(name, "")
        whole = _EXPRESSION.fullmatch(_resolve_conditionals(expression, conditional_else=True).strip())
        return int(whole.group(2)) if whole and whole.group(2) else None

    def compute(self, inner: str, seen: frozenset[str] = frozenset()) -> float | None:
        """An expression's value, every token in it read with its sign; None if any can't be."""
        inner = _STRAY_TIMES.sub("*", inner)
        inner = _VARIABLE.sub(lambda v: _text_or(self.variable(v.group(1), seen), v.group(0)), inner)
        inner = _TOKEN.sub(
            lambda t: _text_or(_signed(self.book, self.ref(t.group(1)), t.group(2), t.group(3)), t.group(0)),
            inner,
        )
        return _arithmetic(inner)

    def spell_ref(self, m: re.Match[str]) -> str:
        ref = int(m.group(2))
        if m.group(1) in ("desc", "tooltip"):
            # Shielded so the outer spell's tokens never fill what the referenced spell left unfilled.
            self.shielded.append(evaluate(self.book, ref, depth=self.depth + 1, conditional_else=self.conditional_else))
            return f"\ue000{chr(0xE100 + len(self.shielded) - 1)}\ue000"
        if m.group(1) == "name":
            return self.book.names.get(ref, "")
        return ""

    def expression(self, m: re.Match[str]) -> str:
        result = self.compute(m.group(1))
        if result is None:
            return m.group(0)
        return _decimals(result, int(m.group(2))) if m.group(2) else _whole(result)

    def scaled(self, m: re.Match[str]) -> str:
        v = _signed(self.book, self.ref(m.group(3)), m.group(4), m.group(5))
        if v is None:
            return m.group(0)
        return _number(abs(v) / int(m.group(2)) if m.group(1) == "/" else abs(v) * int(m.group(2)))

    def named(self, m: re.Match[str]) -> str:
        v = self.variable(m.group(1))
        if v is None:
            return m.group(0)
        places = self.variable_places(m.group(1))
        return _whole(v) if places is None else _decimals(v, places)

    def token(self, m: re.Match[str]) -> str:
        ref, letter, number = self.ref(m.group(1)), m.group(2), m.group(3)
        if letter in "sSwW":
            e = _effect_for(self.book, ref, letter, number)
            if e is not None and e.variance:
                return roll_range(e)
        v = _signed(self.book, ref, letter, number)
        if v is None:
            return m.group(0)
        return format_duration(int(v * 1000)) if letter in "dD" else _number(abs(v))

    def run(self, text: str) -> str:
        text = _resolve_conditionals(text, self.conditional_else)
        text = _SPELL_REF.sub(self.spell_ref, text)
        text = _EXPRESSION.sub(self.expression, text)
        text = _SCALED.sub(self.scaled, text)
        text = _VARIABLE.sub(self.named, text)
        text = _GENDER.sub(lambda g: f"{g.group(1)} or {g.group(2)}", text)
        text = _TOKEN.sub(self.token, text)
        text = _SHIELD.sub(lambda s: self.shielded[ord(s.group(1)) - 0xE100], text)
        text = _plural(text)
        return re.sub(r"\s+", " ", text).strip()


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


def evaluate(
    book: SpellBook,
    spell_id: int,
    template: str | None = None,
    depth: int = 0,
    *,
    conditional_else: bool = False,
) -> str:
    """The tooltip of ``spell_id`` (or ``template`` read in its context) as plain text."""
    if depth > MAX_DEPTH:
        return ""
    text = book.descriptions.get(spell_id, "") if template is None else template
    return _Evaluator(book, spell_id, depth, conditional_else).run(text)


def _text_or(value: float | None, fallback: str) -> str:
    return fallback if value is None else repr(value)
