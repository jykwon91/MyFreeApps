"""User-facing copy for role and class limits: refusals on the post's buttons
and menus, the marks in the spec select, and Raid: Edit's lines, forms and notices.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Final

from app.services.discord.raid_draft_copy import NOTHING_CHANGED
from app.services.wow.raid_catalog import CLASSES, CLASSES_BY_KEY, ROLE_DESCRIPTIONS, TANK_COLUMN, WowSpecInfo
from app.services.wow.raid_limit_forms import LineError
from app.services.wow.raid_limits import LimitHit
from app.services.wow.raid_post_layout import ROLE_ROW
from app.services.wow.raid_text import escape_markdown

# How a refusal ends: what to do instead.
END_CLASS: Final = "Pick another class, or tap **Tentative** to get on the list."
END_SPEC: Final = "Pick another spec, or tap **Tentative** to get on the list."
END_LISTED: Final = "Nothing changed. You're still on the list."
# The spec select's second line when a spec is marked.
SPEC_MARKS_NOTE: Final = "Marked specs have no room right now."

ROLE_MODAL: Final = "Role limits"
ROLE_FIELD_LABELS: Final[dict[str, str]] = {
    "tank": "Max tanks",
    "melee": "Max melee DPS",
    "ranged": "Max ranged DPS",
    "healer": "Max healers",
}
ROLE_HINT: Final = "Whole numbers from 0 to 40 (0 means none allowed). Leave a box empty for no limit."
ROLE_PLACEHOLDER: Final = "No limit"
CLASS_MODAL: Final = "Class limits"
CLASS_LABEL: Final = "Max players per class (one per line)"
CLASS_HINT: Final = "0 means none allowed. Tank specs count under Role limits, not here."
CLASS_PLACEHOLDER: Final = "Rogue: 3"

ROLE_OK: Final = "Role limits saved."
ROLE_CLEARED: Final = "Role limits cleared."
CLASS_OK: Final = "Class limits saved."
CLASS_CLEARED: Final = "Class limits cleared."
CLASS_BAD_TAIL: Final = "Tap **Class limits** to fix them. Any class without a readable line keeps its old limit."

# A refusal names the role in the plural; "can join as" in the singular.
_ROLE_WORDS: Final[dict[str, str]] = {
    "tank": "tanks",
    "melee": "melee DPS",
    "ranged": "ranged DPS",
    "healer": "healers",
}
_ROLE_ONE: Final[dict[str, str]] = {"tank": "a tank", "melee": "melee DPS", "ranged": "ranged DPS", "healer": "a healer"}
_ROLE_SINGULAR: Final[dict[str, str]] = {"tank": "tank", "melee": "melee DPS", "ranged": "ranged DPS", "healer": "healer"}
_LISTED_ERRORS: Final = 3
_SHOWN_OVER: Final = 3
_ECHO_MAX: Final = 20


# ---------------------------------------------------------------------------
# On the post's buttons and menus
# ---------------------------------------------------------------------------


def refusal_end(*, listed: bool, spec_select: bool) -> str:
    """Still on the list → nothing changed; else what to pick instead."""
    if listed:
        return END_LISTED
    if spec_select:
        return END_SPEC
    return END_CLASS


def refusal(hits: Sequence[LimitHit], column: str, end: str) -> str:
    """Why the pick has no room: its one reason, or — several — that the whole column is full."""
    if len(hits) == 1:
        return f"{hit_text(hits[0])} {end}"
    return f"Every **{_column_word(column)}** spec is full right now. {end}"


def hit_text(hit: LimitHit) -> str:
    if hit.kind == "class":
        label = CLASSES_BY_KEY[hit.key].label
        if hit.limit == 0:
            return f"This raid isn't taking any **{label}s**."
        return f"**{label}** is full ({hit.count}/{hit.limit})."
    word = _ROLE_WORDS[hit.key]
    if hit.limit == 0:
        return f"This raid isn't taking any **{word}**."
    return f"The raid already has all the **{word}** it needs ({hit.count}/{hit.limit})."


def spec_mark(spec: WowSpecInfo, hit: LimitHit, column: str) -> str:
    """A spec option with no room: 'Healer · full (4/4)', 'Melee DPS · Warrior is full (3/3)'.

    Every option under [Tank] is a tank, so there it's just the reason.
    """
    reason = f"full ({hit.count}/{hit.limit})"
    if hit.limit == 0:
        reason = "not open"
    elif hit.kind == "class":
        reason = f"{CLASSES_BY_KEY[hit.key].label} is {reason}"
    if column == TANK_COLUMN:
        return reason
    return f"{ROLE_DESCRIPTIONS[spec.display_role]} · {reason}"


def _column_word(column: str) -> str:
    if column == TANK_COLUMN:
        return "tank"
    return CLASSES_BY_KEY[column].label


# ---------------------------------------------------------------------------
# Raid: Edit's card and forms
# ---------------------------------------------------------------------------


def role_limits_line(roles: Mapping[str, int]) -> str:
    """'**Role limits:** Tanks 2 · Healers 4', in role-row order."""
    parts = [f"{label} {roles[role]}" for role, label, _ in ROLE_ROW if role in roles]
    return f"**Role limits:** {' · '.join(parts) or '*none*'}"


def class_limits_line(classes: Mapping[str, int]) -> str:
    """'**Class limits:** Warrior 6 · Rogue 3', in the post's class order."""
    parts = [f"{cls.label} {classes[cls.key]}" for cls in CLASSES if cls.key in classes]
    return f"**Class limits:** {' · '.join(parts) or '*none*'}"


def role_notice(
    old: Mapping[str, int], new: Mapping[str, int], bad: Sequence[str], over: Sequence[LimitHit]
) -> str:
    """What the Role limits form did, and any limit the raid is already past."""
    changed = dict(old) != dict(new)
    if bad:
        boxes = _joined([f"**{ROLE_FIELD_LABELS[role]}**" for role in bad], "and")
        text = f"{_lead(changed)} I couldn't read {boxes}. Use a whole number from 0 to 40, or leave a box empty."
    else:
        text = _saved(changed, cleared=not new, ok=ROLE_OK, cleared_text=ROLE_CLEARED)
    return _with_over(text, over)


def class_notice(
    old: Mapping[str, int], new: Mapping[str, int], errors: Sequence[LineError], over: Sequence[LimitHit]
) -> str:
    """What the Class limits form did — the lines it couldn't read, up to three — and any limit already past."""
    changed = dict(old) != dict(new)
    if not errors:
        return _with_over(_saved(changed, cleared=not new, ok=CLASS_OK, cleared_text=CLASS_CLEARED), over)
    lines = [f"{_lead(changed)} I couldn't read these lines:"]
    lines.extend(f"- {line_error(error)}" for error in errors[:_LISTED_ERRORS])
    if len(errors) > _LISTED_ERRORS:
        lines.append(f"…and {len(errors) - _LISTED_ERRORS} more.")
    lines.append(CLASS_BAD_TAIL)
    return _with_over("\n".join(lines), over)


def line_error(error: LineError) -> str:
    where = f"Line {error.line}:"
    if error.problem == "colon":
        return f'{where} write it like "Rogue: 3".'
    if error.problem == "tank":
        return f"{where} tank limits are under **Role limits** (Max tanks), not here."
    if error.problem == "number":
        return f'{where} "{_echo(error.text)}" isn\'t a number from 0 to 40. Use 0 for none, or "no limit".'
    text = f'{where} there\'s no class called "{_echo(error.text)}".'
    if error.suggestion is not None:
        text = f"{text} Did you mean {CLASSES_BY_KEY[error.suggestion].label}?"
    return text


def over_limit_note(hits: Sequence[LimitHit]) -> str:
    """Limits just lowered below the players in line: nobody is removed."""
    shown = [_counted(hit) for hit in hits[:_SHOWN_OVER]]
    if len(hits) > _SHOWN_OVER:
        counts = f"{', '.join(shown)} and {len(hits) - _SHOWN_OVER} more over their limits"
        kinds = "any of them"
    else:
        counts = _joined(shown, "and")
        kinds = _joined([_one(hit) for hit in hits], "or")
    return (
        f"The raid already has {counts}. Nobody was removed, but nobody else can join as {kinds} until there's room."
    )


def _saved(changed: bool, *, cleared: bool, ok: str, cleared_text: str) -> str:
    if not changed:
        return NOTHING_CHANGED
    if cleared:
        return cleared_text
    return ok


def _lead(changed: bool) -> str:
    if changed:
        return "Saved the rest."
    return NOTHING_CHANGED


def _with_over(text: str, over: Sequence[LimitHit]) -> str:
    if not over:
        return text
    return f"{text}\n{over_limit_note(over)}"


def _counted(hit: LimitHit) -> str:
    """'4 Rogues', '3 tanks', '1 melee DPS'."""
    if hit.kind == "class":
        noun = CLASSES_BY_KEY[hit.key].label
    else:
        noun = _ROLE_SINGULAR[hit.key]
    if hit.count != 1 and not noun.endswith("DPS"):
        noun = f"{noun}s"
    return f"{hit.count} {noun}"


def _one(hit: LimitHit) -> str:
    """'a Rogue', 'a tank', 'melee DPS'."""
    if hit.kind == "class":
        return f"a {CLASSES_BY_KEY[hit.key].label}"
    return _ROLE_ONE[hit.key]


def _joined(items: Sequence[str], word: str) -> str:
    """'a', 'a and b', 'a, b and c'."""
    if len(items) < 2:
        return "".join(items)
    return f"{', '.join(items[:-1])} {word} {items[-1]}"


def _echo(text: str) -> str:
    """What the leader typed, on one line, cut short and shown literally."""
    flat = " ".join(text.split())
    if len(flat) > _ECHO_MAX:
        flat = flat[: _ECHO_MAX - 1] + "…"
    return escape_markdown(flat)
