"""The per-version fields a tweak can change besides ingredients and steps.

The version diff compares each of these, in this order. ``change_note`` is not
one of them: it describes a tweak rather than being part of the recipe, and
title/description/source live on the recipe, not on a version.
"""
from __future__ import annotations

from typing import Final, Literal

VersionDiffField = Literal["servings", "prep_minutes", "cook_minutes"]

VERSION_DIFF_FIELDS: Final[tuple[VersionDiffField, ...]] = (
    "servings",
    "prep_minutes",
    "cook_minutes",
)
