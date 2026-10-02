"""The words of Copy raid — on Raid: Edit's card.

Titles come in already escaped (``raid_text.title_text``).
"""
from __future__ import annotations

from typing import Final

NOT_PERMITTED_COPY: Final = "Copying raids needs the Manage Events permission, like scheduling them."
COPY_MODAL: Final = "Copy raid"


def copied(title: str) -> str:
    """Above the create preview of a copy."""
    return f"A copy of **{title}**. Nobody's signed up yet. Check it, then **Post raid**."
