"""The web form offers the same move-in window the server accepts."""
import re
from pathlib import Path

from app.core.public_inquiry_constants import MAX_MOVE_IN_DAYS_AHEAD

FORM_HELPERS = (
    Path(__file__).parents[2]
    / "frontend" / "src" / "app" / "features" / "public-inquiry" / "public-inquiry-helpers.ts"
)


def test_the_form_s_latest_move_in_matches_the_server() -> None:
    form_limit = re.search(
        r"^export const MAX_MOVE_IN_DAYS_AHEAD = (\d+);$", FORM_HELPERS.read_text(), re.MULTILINE,
    )
    assert form_limit, "MAX_MOVE_IN_DAYS_AHEAD not found in the form helpers"
    assert int(form_limit.group(1)) == MAX_MOVE_IN_DAYS_AHEAD
