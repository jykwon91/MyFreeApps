"""Raid: Edit → Role limits / Class limits: read what the leader typed — pure.

**Role limits** is four boxes (tank, melee, ranged, healer): a whole number
from 0 to 40, or empty for no limit.  A box that can't be read keeps the
limit the raid had.

**Class limits** is one box, a class per line — ``Rogue: 3``.  Any case, a
plural ("Rogues") or the class's tag ("ROG") names a class; ``<`` and
``>`` are ignored, so a copied ``<Rogue>: <3>`` works.  A value of
"no limit", "unlimited" or nothing clears that class's limit; when a class
has more than one line, the last wins.  Line numbers count every line,
blank ones too, so they match what the leader sees.  On a submit where
every line reads, a class left out has no limit; when any line can't be
read, a class without a readable line keeps the limit it had.

Neither reader raises: whatever reads is saved, the rest is reported.
"""
from __future__ import annotations

import difflib
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final, Literal

from app.services.wow.raid_catalog import CLASSES
from app.services.wow.raid_limits import LIMIT_CLASSES, LIMIT_MAX, LIMIT_ROLES

NO_LIMIT: Final = "no limit"
_NO_LIMIT_WORDS: Final = frozenset({"", NO_LIMIT, "unlimited"})
_TANK_WORDS: Final = frozenset({"tank", "tanks"})
_NUMBER: Final = re.compile(r"[0-9]{1,3}")
# Every way a line can name a class: its key, its name and its tag, lower-cased.
_CLASS_NAMES: Final[dict[str, str]] = {
    name: cls.key for cls in CLASSES for name in (cls.key, cls.label.lower(), cls.tag.lower())
}

LineProblem = Literal["colon", "unknown", "tank", "number"]


@dataclass(frozen=True)
class RoleForm:
    limits: dict[str, int]
    bad: list[str]  # roles whose box couldn't be read


@dataclass(frozen=True)
class LineError:
    """A Class limits line that couldn't be read."""

    problem: LineProblem
    line: int  # 1-based, blank lines counted
    text: str  # what was written: the class name, or the value
    suggestion: str | None = None  # a class key, for "Did you mean …?"


@dataclass(frozen=True)
class ClassForm:
    limits: dict[str, int]
    errors: list[LineError]


def read_limit(text: str) -> int | None:
    """A whole number from 0 to ``LIMIT_MAX``, else None."""
    value = text.strip()
    if not _NUMBER.fullmatch(value) or int(value) > LIMIT_MAX:
        return None
    return int(value)


def read_role_form(fields: Mapping[str, str], old: Mapping[str, int]) -> RoleForm:
    """The four boxes: empty clears a role's limit; one that can't be read (or is missing) keeps it."""
    limits: dict[str, int] = {}
    bad: list[str] = []
    for role in LIMIT_ROLES:
        text = fields.get(role)
        if text is None or not text.strip():
            if text is None and role in old:
                limits[role] = old[role]
            continue
        value = read_limit(text)
        if value is None:
            bad.append(role)
            if role in old:
                limits[role] = old[role]
            continue
        limits[role] = value
    return RoleForm(limits, bad)


def read_class_form(text: str, old: Mapping[str, int]) -> ClassForm:
    """The class-per-line box; see the module docstring for what reads."""
    picked: dict[str, int | None] = {}
    errors: list[LineError] = []
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.replace("<", "").replace(">", "").strip()
        if not line:
            continue
        read = _read_line(number, line)
        if isinstance(read, LineError):
            errors.append(read)
            continue
        class_key, limit = read
        picked[class_key] = limit
    limits: dict[str, int] = {}
    if errors:
        limits = dict(old)
    for class_key, limit in picked.items():
        limits.pop(class_key, None)
        if limit is not None:
            limits[class_key] = limit
    return ClassForm({key: limits[key] for key in LIMIT_CLASSES if key in limits}, errors)


def class_form_prefill(limits: Mapping[str, int]) -> str:
    """Every class on its own line, in post order: 'Warrior: no limit', 'Rogue: 3'."""
    lines = []
    for cls in CLASSES:
        value = NO_LIMIT
        if cls.key in limits:
            value = str(limits[cls.key])
        lines.append(f"{cls.label}: {value}")
    return "\n".join(lines)


def _read_line(number: int, line: str) -> tuple[str, int | None] | LineError:
    name, colon, value = line.partition(":")
    if not colon:
        return LineError("colon", number, line)
    word = " ".join(name.lower().split())
    if word in _TANK_WORDS:
        return LineError("tank", number, name.strip())
    class_key = _class_key(word)
    if class_key is None:
        suggestion = next(iter(difflib.get_close_matches(word, LIMIT_CLASSES, n=1)), None)
        return LineError("unknown", number, name.strip(), suggestion)
    wanted = " ".join(value.lower().split())
    if wanted in _NO_LIMIT_WORDS:
        return class_key, None
    limit = read_limit(wanted)
    if limit is None:
        return LineError("number", number, value.strip())
    return class_key, limit


def _class_key(word: str) -> str | None:
    """'rogue', 'rogues', 'rog' → 'rogue'."""
    if word in _CLASS_NAMES:
        return _CLASS_NAMES[word]
    if word.endswith("s"):
        return _CLASS_NAMES.get(word[:-1])
    return None
