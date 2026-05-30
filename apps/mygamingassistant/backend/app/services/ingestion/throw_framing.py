"""Throw-clip framing — movement-aware pre-release padding.

The throw pane shows the throw MOTION (windup -> release -> follow-through).
How much *windup* precedes the release depends on HOW the throw is executed: a
standing throw is a quick flick (the locked aim sits right up to the release),
whereas a jump-throw, run-throw or walk-throw begins its defining movement well
before the grenade leaves the hand. A single flat pre-release pad cannot frame
both — the 1.0s tuned for standing throws (a longer pad duplicated the AIM pane
on lineup 7bd971c3, 2026-05-24; see ``clip_generator._PRE_RELEASE_SECONDS``)
clips into the middle of a jump / run windup, cutting off the very movement the
pane exists to teach.

This module maps a lineup's already-extracted ``technique`` phrase — the PR3
glance-board footer, e.g. ``"Jumpthrow + LMB"`` / ``"Run + RMB"`` /
``"Standing + LMB"`` — to the right pre-release pad. It is a PURE function over
the persisted technique string:

  - It makes NO Claude call and does NO frame extraction.
  - It does NOT touch the load-bearing throw-timing localiser. ``release_ts`` is
    unchanged; only the clip window *around* it widens. (Decoupling the framing
    decision from the freshly-stabilised release localiser is deliberate — see
    PRs #799/#802/#803.)
  - Only the PRE pad varies; the post-release follow-through is
    movement-independent.

``technique`` is the single source of throw-type truth (named once by
``throw_technique_classifier``); the clip path reads it rather than re-detecting
movement, so the two surfaces never disagree. When technique is absent — null,
not yet extracted at ingest time, or a Valorant ability cast with no movement
component (``"E + 2-charge"``) — the pad falls back to the standing default,
identical to the pre-feature behaviour, so nothing regresses.
"""
from __future__ import annotations

from typing import Optional

# The standing/default pre-release pad: the historical flat value, tuned DOWN
# from 2.0 to avoid duplicating the AIM pane on standing throws. Mirrors
# ``clip_generator._PRE_RELEASE_SECONDS`` by design — they are the same
# "stationary throw" default expressed once on each surface.
_STANDING_PRE_RELEASE_SECONDS = 1.0

# Pre-release clip pad (seconds) per throw movement. INITIAL values pending an
# operator full-res re-cut eyeball (clip framing is operator-judged at full
# resolution, never asserted from timestamps alone — see the throw-localizer
# memory's process lesson). Tune here without touching the clip geometry.
#
#   - Stationary techniques (standing, crouch) keep the 1.0s default — the
#     locked aim sits right up to a flick/crouch release, so a wider pad would
#     re-show the AIM pane.
#   - Moving techniques widen the PRE pad to capture the run-up / jump windup
#     the throw pane exists to demonstrate (a jump-throw's leap, a run-throw's
#     stride). The POST pad is unchanged (follow-through is movement-agnostic).
_PRE_RELEASE_SECONDS_BY_MOVEMENT: dict[str, float] = {
    "standing": _STANDING_PRE_RELEASE_SECONDS,
    "crouch": _STANDING_PRE_RELEASE_SECONDS,
    "jump": 1.5,
    "walk": 1.5,
    "run": 2.0,
}


def _movement_from_technique(technique: Optional[str]) -> Optional[str]:
    """Classify the throw MOVEMENT from a ``technique`` footer phrase.

    Reads only the head token — the substring before the first ``"+"``, which
    separates the movement+throw-type from the input (mouse button / ability
    charge). So ``"Jumpthrow + LMB"`` -> ``"jump"``, ``"Run + RMB"`` ->
    ``"run"``, ``"Standing + LMB"`` -> ``"standing"``.

    The CS2 technique vocabulary's movement words (standing / jumpthrow[-bind]
    / run[-throw] / walk[-throw] / crouch[-throw]) are matched by substring on
    that head, so both the compact form (``"Run"``) and the full form
    (``"run-throw"``) resolve, as does a partial answer that is just the
    movement (``"Jumpthrow"``).

    Returns ``None`` for a Valorant ability key (``"E + 2-charge"``), an empty
    or ``None`` phrase, or anything without a recognised movement word — the
    caller then uses the standing default.
    """
    if not technique:
        return None
    head = technique.split("+", 1)[0].strip().lower()
    if not head:
        return None
    # Substring tests on the constrained vocabulary head are unambiguous — no
    # two CS2 movement words share a stem, and Valorant heads are single keys.
    if "jump" in head:
        return "jump"
    if "run" in head:
        return "run"
    if "walk" in head:
        return "walk"
    if "crouch" in head:
        return "crouch"
    if "stand" in head:
        return "standing"
    return None


def pre_release_seconds_for_technique(technique: Optional[str]) -> float:
    """Pre-release clip pad (seconds) for a lineup's throw ``technique``.

    Movement-aware: moving throws (jump / run / walk) widen the pad to include
    their windup; stationary throws (standing / crouch) and any
    unknown / absent / Valorant technique use the standing default. Pure and
    total — safe to call with ``None``.
    """
    movement = _movement_from_technique(technique)
    return _PRE_RELEASE_SECONDS_BY_MOVEMENT.get(
        movement or "standing", _STANDING_PRE_RELEASE_SECONDS
    )
