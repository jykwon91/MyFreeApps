"""How many ingredients and steps one recipe version may have.

Every tweak copies all rows forward into a new version, so the lists are bounded
as well as each item. Real recipes run to a few dozen of each; these leave room.
"""
from __future__ import annotations

from typing import Final

RECIPE_INGREDIENTS_MAX: Final = 200
RECIPE_STEPS_MAX: Final = 200
