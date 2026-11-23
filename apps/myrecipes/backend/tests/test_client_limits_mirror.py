"""The web and phone forms state the same limits the backend enforces.

``@myrecipes/api-client`` copies these numbers so both forms can explain a limit
before saving; a drift would show one number and enforce another.
"""
from __future__ import annotations

import math
import re
from pathlib import Path

import pytest

from app.core.config import settings
from app.core.photo_import_constants import MAX_PHOTO_PIXELS
from app.core.recipe_content_limits import RECIPE_INGREDIENTS_MAX, RECIPE_STEPS_MAX

_CONSTANTS = Path(__file__).resolve().parents[2] / "api-client" / "src" / "constants"


def _ts_number(file: str, name: str) -> int:
    """The value of ``export const NAME = 15 * 1024 * 1024;`` (integers and ``*`` only)."""
    text = (_CONSTANTS / file).read_text(encoding="utf-8")
    match = re.search(rf"export const {name} = ([0-9_]+(?:\s*\*\s*[0-9_]+)*);", text)
    assert match, f"{name} not found in {file}"
    return math.prod(int(factor) for factor in match.group(1).split("*"))


@pytest.mark.parametrize(
    ("file", "name", "expected"),
    [
        ("recipeForm.ts", "RECIPE_INGREDIENTS_MAX", RECIPE_INGREDIENTS_MAX),
        ("recipeForm.ts", "RECIPE_STEPS_MAX", RECIPE_STEPS_MAX),
        ("photoImport.ts", "PHOTO_IMPORT_MAX_BYTES", settings.max_photo_upload_bytes),
        ("photoImport.ts", "PHOTO_IMPORT_MAX_MEGAPIXELS", MAX_PHOTO_PIXELS // 1_000_000),
    ],
)
def test_client_constant_matches_backend(file: str, name: str, expected: int) -> None:
    assert _ts_number(file, name) == expected
