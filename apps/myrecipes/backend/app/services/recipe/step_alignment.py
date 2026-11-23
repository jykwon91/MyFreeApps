"""Line up the steps of two versions by their text.

Steps have no stable key across versions, so matching them by position makes one
inserted or removed step look like a change to every step after it. Instead the
two lists are aligned: identical steps (ignoring case and spacing) are matched as a
longest common sequence, and in each stretch between them a step is paired with
one at least ``STEP_EDIT_MIN_SIMILARITY`` alike, as an edit. Everything left over
was removed from the old version or added in the new one.
"""
from __future__ import annotations

from difflib import SequenceMatcher

from app.core.step_alignment_constants import STEP_EDIT_MIN_SIMILARITY

# One aligned row: (index in the old list, index in the new list). None on one side
# means the step exists only on the other side (removed, or added).
StepPair = tuple[int | None, int | None]


def normalize_step_text(text: str) -> str:
    """A step's wording with case and spacing ignored, as the alignment compares it."""
    return " ".join(text.split()).casefold()


def _similarity(a: list[str], b: list[str]) -> float:
    """How alike two steps' words are (0 to 1), or 0 when they can't reach the threshold."""
    matcher = SequenceMatcher(a=a, b=b, autojunk=False)
    if matcher.quick_ratio() < STEP_EDIT_MIN_SIMILARITY:
        return 0.0
    ratio = matcher.ratio()
    return ratio if ratio >= STEP_EDIT_MIN_SIMILARITY else 0.0


def _pair_edits(old_words: list[list[str]], new_words: list[list[str]]) -> list[StepPair]:
    """Align one stretch of differing steps, pairing the most alike steps in order.

    A small dynamic programme over the stretch: each old step is either paired with a
    sufficiently similar new step or removed, and each new step paired or added, so as
    to maximise the total similarity of the pairs while keeping both orders.
    """
    n, m = len(old_words), len(new_words)
    similarity = [[_similarity(old, new) for new in new_words] for old in old_words]
    best = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            paired = similarity[i][j] + best[i + 1][j + 1] if similarity[i][j] else 0.0
            best[i][j] = max(paired, best[i + 1][j], best[i][j + 1])

    pairs: list[StepPair] = []
    i = j = 0
    while i < n and j < m:
        if similarity[i][j] and best[i][j] == similarity[i][j] + best[i + 1][j + 1]:
            pairs.append((i, j))
            i, j = i + 1, j + 1
        elif best[i][j] == best[i + 1][j]:
            pairs.append((i, None))
            i += 1
        else:
            pairs.append((None, j))
            j += 1
    pairs.extend((index, None) for index in range(i, n))
    pairs.extend((None, index) for index in range(j, m))
    return pairs


def align_steps(before: list[str], after: list[str]) -> list[StepPair]:
    """Every step of both versions as aligned (old index, new index) rows, in reading order."""
    old_text = [normalize_step_text(text) for text in before]
    new_text = [normalize_step_text(text) for text in after]
    pairs: list[StepPair] = []
    matcher = SequenceMatcher(a=old_text, b=new_text, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            pairs.extend(zip(range(i1, i2), range(j1, j2)))
            continue
        stretch = _pair_edits(
            [text.split() for text in old_text[i1:i2]],
            [text.split() for text in new_text[j1:j2]],
        )
        pairs.extend(
            (None if old is None else i1 + old, None if new is None else j1 + new)
            for old, new in stretch
        )
    return pairs
