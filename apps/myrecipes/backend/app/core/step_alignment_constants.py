"""How alike two steps' wording must be for the version diff to call one an edit of the other.

Steps carry no lineage key, so the diff lines the two versions' steps up by their
text. Where the text differs, a pair of steps at least this similar (0 to 1, by
shared words in order) reads as one *changed* step; a less similar pair reads as
one step removed and another added.
"""
from __future__ import annotations

from typing import Final

STEP_EDIT_MIN_SIMILARITY: Final = 0.5
